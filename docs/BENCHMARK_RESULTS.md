# Calibration results

Measured 2 October 2026 with GPT-6.1 Sol and high reasoning. This is a seeded
regression corpus: 20 faults in four repository modules, three prompt variants,
three repetitions per variant. Hidden behavioral tests evaluate edited source.

| Variant | Behavioral acceptance | Finished within six requests | Estimated USD |
| --- | ---: | ---: | ---: |
| Vanilla | 60/60 | 59/60 | 0.564505 |
| Full installed instructions | 60/60 | 60/60 | 1.124212 |
| Compact ContextOS selection | 60/60 | 60/60 | 0.762238 |

The vanilla attempt stopped at the six-request limit with a correct patch. A
separately recorded continuation finished after one additional request. Its
original matrix result remains unchanged.

Compact selection used 71.8% fewer input tokens and 32.2% less estimated cost
than full instructions. It cost 35.0% more than vanilla. Costs include observed
cache effects and provider-reported cache writes; token estimates are not invoices.
All variants passed every behavioral check, so no quality advantage was measured.
Repeated faults are correlated and this corpus has a ceiling effect.

A Codex CLI 0.159.2 probe confirmed explicit skill-body loading and marker
adherence. Automatic routing and Cursor activation remain unverified. A synthetic
12-turn smoke passed 36/36 responses across the variants, but echoed the record
each turn; it does not test distant fact recall or production long-session quality.

The generic controller and hidden-oracle fixtures live under `benchmarks/`.
API keys, machine-specific launchers, raw responses, spending ledgers and local
reports are excluded from Git and npm packages. Paid runs are opt-in.
See [the benchmark protocol](BENCHMARK_PROTOCOL.md) and
[adapter compatibility](ADAPTER_COMPATIBILITY.md).
