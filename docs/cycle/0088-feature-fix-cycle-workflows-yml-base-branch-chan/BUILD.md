All write paths blocked. Need manual intervention to break the bootstrapping catch-22.

**Please run this in your terminal:**

```sh
cd /Users/timothyjohnson/wrk/cycle
node -e "
const fs = require('fs');
const p = '.claude/settings.local.json';
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
d.permissions.allow.push('Edit(/Users/timothyjohnson/wrk/**)', 'Write(/Users/timothyjohnson/wrk/**)');
fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
console.log('Updated:', d.permissions.allow);
"
```

Once that's done, I can proceed with the three source edits for cycle 0088.
