import { performance } from 'node:perf_hooks';
import { collectMediaMatches } from '../src/shared/media-query.ts';

const sizes = [100, 1_000, 10_000, 50_000];
const iterations = 7;
const maxP95MsAt50k = 250;
const report = [];

for (const size of sizes) {
  const fixture = Array.from({ length: size }, (_, index) => ({
    type: index % 4 === 0 ? 'video' : 'image',
    url: `https://pbs.twimg.com/media/fixture-${index}.jpg`,
    tweetDate: Date.UTC(2026, index % 9, 1),
    tweetText: index % 5 === 0 ? `benchmark match ${index}` : `fixture ${index}`,
  }));
  collectMediaMatches(fixture, { filterType: 'all', keyword: 'benchmark' }, 200);
  const samples = [];
  for (let run = 0; run < iterations; run++) {
    const start = performance.now();
    const result = collectMediaMatches(fixture, { filterType: 'images', dateFrom: '2026-02-01', dateTo: '2026-08-31', keyword: 'benchmark' }, 200);
    samples.push(performance.now() - start);
    if (result.items.length > 200 || result.total > size) throw new Error('Invalid benchmark result');
  }
  samples.sort((a, b) => a - b);
  report.push({
    size,
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
    p95Ms: Number(samples[Math.ceil(samples.length * 0.95) - 1].toFixed(3)),
  });
}

console.log(JSON.stringify({ iterations, report }, null, 2));
const largest = report.at(-1);
if (!largest || largest.p95Ms > maxP95MsAt50k) {
  console.error(`Media query budget exceeded: ${largest?.p95Ms ?? 'n/a'}ms > ${maxP95MsAt50k}ms at 50k`);
  process.exitCode = 1;
}
