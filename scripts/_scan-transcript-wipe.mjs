import fs from 'node:fs';

const path = process.argv[2];
const lines = fs.readFileSync(path, 'utf8').split(/\n/);
const slice = lines.slice(-150);
const out = [];

for (let i = 0; i < slice.length; i++) {
  const line = slice[i];
  const abs = lines.length - 150 + i + 1;
  if (line.includes('user_query')) {
    const m = line.match(/<user_query>\s*([\s\S]*?)<\/user_query>/);
    if (m) out.push(`U${abs}: ${m[1].replace(/\s+/g, ' ').slice(0, 180)}`);
  }
  if (line.includes('"name":"Shell"')) {
    const m = line.match(/"command":"((?:\\.|[^"\\]){0,280})/);
    if (m) {
      const c = m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').slice(0, 220);
      out.push(`S${abs}: ${c}`);
    }
  }
  if (/TS_EMPTY|mass empty|_emergency|checkout HEAD --|wipe restore|empty-file/.test(line)) {
    out.push(`K${abs}: keyword`);
  }
}

// Full-file scan for dangerous mass overwrite patterns (sample hits)
const dangerHits = [];
for (let n = 0; n < lines.length; n++) {
  const line = lines[n];
  if (!line.includes('"name":"Shell"') && !line.includes('"name":"Write"')) continue;
  const dangerous =
    /contents":""|Set-Content|Clear-Content|Out-File|truncate\(|writeFileSync\([^,]+,\s*['"]['"]|rimraf|git clean -fdx|git reset --hard|Remove-Item -Recurse.*(services|components|hooks)/i.test(
      line,
    );
  const restore =
    /TS_EMPTY|_emergency-restore|checkout HEAD --|mass empty|empty-file wipe/i.test(line);
  if (dangerous || restore) {
    const cmd = line.match(/"command":"((?:\\.|[^"\\]){0,200})/);
    dangerHits.push({
      n: n + 1,
      kind: dangerous ? 'danger' : 'restore',
      cmd: cmd ? cmd[1].replace(/\\n/g, ' ').slice(0, 160) : null,
    });
  }
}

console.log('=== last 150 lines interest ===');
console.log(out.join('\n') || '(none)');
console.log('\n=== danger/restore hits (last 30) ===');
console.log(JSON.stringify(dangerHits.slice(-30), null, 2));
console.log(`total_lines=${lines.length} danger_or_restore=${dangerHits.length}`);
