# ux-design Examples — Anti-patterns vs ContextOS Standard

## Example 1: Destructive Actions

### Anti-pattern: Instant Deletion Without Confirmation or Recovery

```tsx
// BAD: Immediate delete on click, no confirmation, irreversible data loss
<button onClick={() => deleteProject(project.id)}>Delete</button>
```

### Best practice: ContextOS Standard (Two-Step Confirmation or Undo Toast)

```tsx
// GOOD: Clear confirmation dialog stating exact item name and non-reversible impact
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete Project</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete <strong>{project.name}</strong>
        and all associated API keys.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete} className="bg-destructive">
        Delete permanently
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
