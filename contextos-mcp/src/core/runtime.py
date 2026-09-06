"""
Swarm Runtime — Python-side helpers for the swarm-cli orchestrator.

Extends the RLM runtime with thread spawning primitives:
  - `thread(task, context, agent, model, files)`: spawn a coding agent thread
  - `async_thread(...)`: async version for asyncio.gather()
  - `merge_threads()`: merge all completed thread branches

Communication protocol (line-delimited JSON over stdio):
  -> stdout: {"type":"llm_query","sub_context":"...","instruction":"...","id":"..."}
  <- stdin:  {"type":"llm_result","id":"...","result":"..."}
  -> stdout: {"type":"thread_request","id":"...","task":"...","context":"...","agent_backend":"...","model":"...","files":[]}
  <- stdin:  {"type":"thread_result","id":"...","result":"...","success":true,"files_changed":[],"duration_ms":0}
  -> stdout: {"type":"merge_request","id":"..."}
  <- stdin:  {"type":"merge_result","id":"...","result":"...","success":true}
  -> stdout: {"type":"exec_done","stdout":"...","stderr":"...","has_final":bool,"final_value":"..."|null}
"""

import json
import sys
import uuid
import io
import traceback
import asyncio
import threading
import queue
import ast

class SecurityError(Exception):
    """Raised when code execution attempts an unauthorized or dangerous operation."""
    pass

_ALLOWED_MODULES = {'json', 'math', 're', 'asyncio', 'datetime', 'random', 'collections'}
_FORBIDDEN_ATTRIBUTES = {
    '__class__', '__subclasses__', '__bases__', '__mro__',
    '__globals__', '__code__', '__builtins__', '__import__'
}

def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root_pkg = name.split('.')[0]
    if root_pkg not in _ALLOWED_MODULES:
        raise SecurityError(f"Security error: import of module '{name}' is forbidden in sandboxed runtime")
    return __import__(name, globals, locals, fromlist, level)

_SAFE_BUILTINS = {
    'abs': abs,
    'all': all,
    'any': any,
    'ascii': ascii,
    'bin': bin,
    'bool': bool,
    'bytearray': bytearray,
    'bytes': bytes,
    'callable': callable,
    'chr': chr,
    'complex': complex,
    'dict': dict,
    'divmod': divmod,
    'enumerate': enumerate,
    'filter': filter,
    'float': float,
    'format': format,
    'frozenset': frozenset,
    'hash': hash,
    'hex': hex,
    'int': int,
    'isinstance': isinstance,
    'issubclass': issubclass,
    'iter': iter,
    'len': len,
    'list': list,
    'map': map,
    'max': max,
    'min': min,
    'next': next,
    'oct': oct,
    'ord': ord,
    'pow': pow,
    'print': print,
    'range': range,
    'repr': repr,
    'reversed': reversed,
    'round': round,
    'set': set,
    'slice': slice,
    'sorted': sorted,
    'str': str,
    'sum': sum,
    'tuple': tuple,
    'type': type,
    'zip': zip,
    'True': True,
    'False': False,
    'None': None,
    'Exception': Exception,
    'ValueError': ValueError,
    'TypeError': TypeError,
    'KeyError': KeyError,
    'IndexError': IndexError,
    'RuntimeError': RuntimeError,
    'SyntaxError': SyntaxError,
    'SecurityError': SecurityError,
    '__import__': _safe_import,
}

def _validate_ast(code: str) -> None:
    """Validate python code AST to reject dangerous imports, attributes, and calls."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_pkg = alias.name.split('.')[0]
                if root_pkg not in _ALLOWED_MODULES:
                    raise SecurityError(f"Security error: import of module '{alias.name}' is forbidden in sandboxed runtime")
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root_pkg = node.module.split('.')[0]
                if root_pkg not in _ALLOWED_MODULES:
                    raise SecurityError(f"Security error: import from module '{node.module}' is forbidden in sandboxed runtime")
        elif isinstance(node, ast.Attribute):
            if node.attr in _FORBIDDEN_ATTRIBUTES:
                raise SecurityError(f"Security error: access to dangerous attribute '{node.attr}' is forbidden")

# Real stdio handles — saved before exec() can redirect sys.stdout/sys.stderr.
_real_stdout = sys.stdout
_real_stdin = sys.stdin

# Lock for stdout writes only
_write_lock = threading.Lock()

# Per-request events and results for concurrent llm_query/thread calls
_pending_results: dict[str, threading.Event] = {}
_result_store: dict[str, str] = {}

# Queue for commands (exec, set_context, etc.) dispatched by the reader thread
_command_queue: queue.Queue = queue.Queue()

# Will be set by the TypeScript host before each execution
context: str = ""

# Sentinel — when set to a non-None value, the loop terminates
__final_result__ = None

# User execution namespace — isolates LLM code from REPL internals
_user_ns: dict = {}


def FINAL(x):
    """Set the final answer as a string and terminate the RLM loop."""
    global __final_result__
    if __final_result__ is not None:
        print(f"[Warning] FINAL() called again — overwriting previous answer", file=sys.stderr)
    __final_result__ = str(x)


def FINAL_VAR(x):
    """Set the final answer from a variable and terminate the RLM loop."""
    global __final_result__
    if __final_result__ is not None and x is not None:
        print(f"[Warning] FINAL_VAR() called again — overwriting previous answer", file=sys.stderr)
    __final_result__ = str(x) if x is not None else None


def _stdin_reader_loop() -> None:
    """Dedicated thread: reads all stdin lines and dispatches them.

    - llm_result/thread_result/merge_result messages go to waiting threads
    - All other messages (exec, set_context, etc.) go to _command_queue
    """
    while True:
        try:
            line = _real_stdin.readline()
        except Exception:
            break
        if not line:
            # stdin closed — wake all pending threads and signal main loop
            for event in list(_pending_results.values()):
                event.set()
            _command_queue.put(None)
            break
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg_type = msg.get("type")
        if msg_type in ("llm_result", "thread_result", "merge_result"):
            rid = msg.get("id", "")
            if rid in _pending_results:
                _result_store[rid] = json.dumps(msg) if msg_type != "llm_result" else msg.get("result", "")
                _pending_results[rid].set()
        elif msg_type == "shutdown":
            _command_queue.put(None)
            break
        else:
            _command_queue.put(msg)


def llm_query(sub_context: str, instruction: str = "") -> str:
    """Send a sub-context and instruction to the parent LLM and return the response."""
    if not instruction:
        instruction = ""

    request_id = uuid.uuid4().hex[:12]
    event = threading.Event()
    _pending_results[request_id] = event

    request = {
        "type": "llm_query",
        "sub_context": sub_context,
        "instruction": instruction,
        "id": request_id,
    }
    with _write_lock:
        _real_stdout.write(json.dumps(request) + "\n")
        _real_stdout.flush()

    event.wait()
    _pending_results.pop(request_id, None)
    result = _result_store.pop(request_id, None)
    if result is None:
        raise RuntimeError("Host process disconnected during llm_query — stdin closed")
    return result


async def async_llm_query(sub_context: str, instruction: str = "") -> str:
    """Async wrapper around llm_query for use with asyncio.gather()."""
    return await asyncio.get_event_loop().run_in_executor(None, llm_query, sub_context, instruction)


def thread(task: str, context: str = "", agent: str = "opencode", model: str = "", files=None) -> str:
    """Spawn a coding agent thread in an isolated git worktree.

    Args:
        task: What the agent should do (be specific)
        context: Additional context to pass to the agent
        agent: Agent backend name ("opencode", "direct-llm", etc.)
        model: Model ID in provider/model-id format (e.g., "anthropic/claude-sonnet-4-6")
        files: List of relevant file paths (hints for the agent)

    Returns:
        Compressed result string with status, files changed, diff, and output summary.
    """
    if files is None:
        files = []

    request_id = uuid.uuid4().hex[:12]
    event = threading.Event()
    _pending_results[request_id] = event

    request = {
        "type": "thread_request",
        "id": request_id,
        "task": task,
        "context": context,
        "agent_backend": agent,
        "model": model,
        "files": files,
    }
    with _write_lock:
        _real_stdout.write(json.dumps(request) + "\n")
        _real_stdout.flush()

    event.wait()
    _pending_results.pop(request_id, None)

    raw = _result_store.pop(request_id, None)
    if raw is None:
        raise RuntimeError("Host process disconnected during thread() — stdin closed")
    try:
        result_msg = json.loads(raw)
        return result_msg.get("result", raw)
    except (json.JSONDecodeError, AttributeError):
        return raw


async def async_thread(task: str, context: str = "", agent: str = "opencode", model: str = "", files=None) -> str:
    """Async version of thread() for use with asyncio.gather().

    Usage:
        import asyncio
        results = await asyncio.gather(
            async_thread("fix auth", files=["src/auth.ts"]),
            async_thread("fix routing", files=["src/router.ts"]),
        )
    """
    if files is None:
        files = []
    return await asyncio.get_event_loop().run_in_executor(
        None, lambda: thread(task, context, agent, model, files)
    )


def merge_threads() -> str:
    """Merge all completed thread branches back into the main branch.

    Returns:
        Merge status string.
    """
    request_id = uuid.uuid4().hex[:12]
    event = threading.Event()
    _pending_results[request_id] = event

    request = {
        "type": "merge_request",
        "id": request_id,
    }
    with _write_lock:
        _real_stdout.write(json.dumps(request) + "\n")
        _real_stdout.flush()

    event.wait()
    _pending_results.pop(request_id, None)

    raw = _result_store.pop(request_id, None)
    if raw is None:
        raise RuntimeError("Host process disconnected during merge_threads() — stdin closed")
    try:
        result_msg = json.loads(raw)
        return result_msg.get("result", raw)
    except (json.JSONDecodeError, AttributeError):
        return raw


def _runtime_symbols() -> dict:
    """Return the dict of runtime symbols injected into the user namespace."""
    return {
        '__builtins__': _SAFE_BUILTINS,
        'context': context,
        'llm_query': llm_query,
        'async_llm_query': async_llm_query,
        'thread': thread,
        'async_thread': async_thread,
        'merge_threads': merge_threads,
        'FINAL': FINAL,
        'FINAL_VAR': FINAL_VAR,
        'asyncio': asyncio,
        'json': json,
    }


def _refresh_user_ns() -> None:
    """Ensure the user namespace has the latest runtime symbols."""
    _user_ns.update(_runtime_symbols())


def _execute_code(code: str) -> None:
    """Execute a code snippet in a sandboxed namespace, capturing output."""
    global __final_result__
    _refresh_user_ns()
    captured_stdout = io.StringIO()
    captured_stderr = io.StringIO()
    old_stdout = sys.stdout
    old_stderr = sys.stderr

    try:
        sys.stdout = captured_stdout
        sys.stderr = captured_stderr
        # Enforce AST security validation
        _validate_ast(code)
        try:
            compiled = compile(code, "<repl>", "exec")
            exec(compiled, _user_ns)
        except SyntaxError as e:
            if "await" in str(code):
                _protected = set(_runtime_symbols().keys())
                async_code = "async def __async_exec__():\n"
                for line in code.split("\n"):
                    async_code += f"    {line}\n"
                async_code += "    return {k: v for k, v in locals().items()}\n"
                _validate_ast(async_code)
                compiled_async = compile(async_code, "<repl>", "exec")
                exec(compiled_async, _user_ns)
                async_fn = _user_ns.pop("__async_exec__")
                _async_locals = asyncio.run(async_fn())
                for k, v in _async_locals.items():
                    if k not in _protected:
                        _user_ns[k] = v
            else:
                raise e
    except Exception:
        traceback.print_exc(file=captured_stderr)
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    stdout_val = captured_stdout.getvalue()
    stderr_val = captured_stderr.getvalue()

    result = {
        "type": "exec_done",
        "stdout": stdout_val,
        "stderr": stderr_val,
        "has_final": __final_result__ is not None,
        "final_value": str(__final_result__) if __final_result__ is not None else None,
    }
    with _write_lock:
        _real_stdout.write(json.dumps(result) + "\n")
        _real_stdout.flush()


def _main_loop() -> None:
    """Process commands from the queue (fed by the stdin reader thread)."""
    while True:
        msg = _command_queue.get()
        if msg is None:
            break

        if msg.get("type") == "exec":
            _execute_code(msg.get("code", ""))
        elif msg.get("type") == "set_context":
            global context
            context = msg.get("value", "")
            ack = {"type": "context_set"}
            with _write_lock:
                _real_stdout.write(json.dumps(ack) + "\n")
                _real_stdout.flush()
        elif msg.get("type") == "reset_final":
            global __final_result__
            __final_result__ = None
            ack = {"type": "final_reset"}
            with _write_lock:
                _real_stdout.write(json.dumps(ack) + "\n")
                _real_stdout.flush()


if __name__ == "__main__":
    ready = {"type": "ready"}
    _real_stdout.write(json.dumps(ready) + "\n")
    _real_stdout.flush()

    # Start dedicated stdin reader thread
    reader = threading.Thread(target=_stdin_reader_loop, daemon=True)
    reader.start()

    _main_loop()
