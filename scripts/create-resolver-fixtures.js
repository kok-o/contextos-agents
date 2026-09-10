const fs = require('fs');
const path = require('path');

const fixturesDir = path.join(__dirname, '..', 'tests', 'fixtures', 'resolver');

const fixtures = {
  'empty.json': {
    task: "Do nothing specific",
    files: []
  },
  'explicit.json': {
    task: "Build with @nextjs",
    files: []
  },
  'inferred.json': {
    task: "Add a new page to the app router",
    files: ["app/page.tsx"]
  },
  'conflict.json': {
    task: "Add brutalist-design and soft-design",
    files: []
  },
  'budget_overflow.json': {
    task: "Build the whole app",
    files: ["app/page.tsx"],
    contextBudgetTokens: 1000
  }
};

for (const [name, content] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(fixturesDir, name), JSON.stringify(content, null, 2));
}

console.log('Fixtures created.');
