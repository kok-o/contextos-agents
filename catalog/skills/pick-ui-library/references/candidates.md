# Candidate categories

These are examples from the reviewed upstream collection, not current rankings.
Verify the actual package and framework versions, maintenance and license before
a recommendation. Suitable existing dependencies take precedence.

| Need | Candidates to investigate | Important integration question |
| --- | --- | --- |
| Accessible dialog/menu primitives | [Base UI](https://base-ui.com/) | Does the project already provide the necessary semantics and focus handling? |
| Springs, layout or gesture motion | [Motion](https://motion.dev/) | Can native CSS or the existing motion stack do the job? |
| Toasts | [Sonner](https://sonner.emilkowal.ski/) | How are status announcements, dismissal and action focus handled? |
| Command menu | [cmdk](https://cmdk.paco.me/) | How will search, keyboard navigation and focus restoration work? |
| Animated numbers | [NumberFlow](https://number-flow.barvian.me/) | Is movement helpful and is a reduced-motion alternative available? |
| Charts | [Recharts](https://recharts.org/) | What data, accessibility and rendering requirements must the chart meet? |
| Drag and drop | [dnd kit](https://dndkit.com/) | Are keyboard/touch alternatives and announcements available? |
| Long lists | [Virtuoso](https://virtuoso.dev/) | Is virtualization justified and does it preserve focus and dynamic content? |

For an uncovered task, consult primary sources and explain the selection rather
than forcing it into this table. Replacing an installed competitor is a separate
decision requiring a concrete benefit within the user's requested scope.
