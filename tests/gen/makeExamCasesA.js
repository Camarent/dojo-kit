'use strict';

const { splitmix64Js, sampleJs } = require('./utils.js');

function examSplitmix64Part1(kit) {
  kit.groups = [];

  // splitmix64 cases
  kit.splitmix64Cases = [];

  kit.splitmix64Cases.push({
    name: 'seed_0_n_5',
    input: { seed: '0', n: 5 },
    expect: (() => {
      let state = 0n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });

  kit.splitmix64Cases.push({
    name: 'seed_1_n_5',
    input: { seed: '1', n: 5 },
    expect: (() => {
      let state = 1n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });

  kit.splitmix64Cases.push({
    name: 'seed_42_n_5',
    input: { seed: '42', n: 5 },
    expect: (() => {
      let state = 42n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });

  kit.splitmix64Cases.push({
    name: 'seed_u64_max_n_5',
    input: { seed: '18446744073709551615', n: 5 },
    expect: (() => {
      let state = 18446744073709551615n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });
}

function examSamplePart1(kit) {
  kit.groups.push({ fn: 'splitmix64', cases: kit.splitmix64Cases });

  // sample cases
  kit.sampleCases = [];

  kit.sampleCases.push({
    name: 'single_section',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'two_sections_sharing_pool',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' },
        { id: 'c4', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [
        { title: 's1', count: 2 },
        { title: 's2', count: 2 }
      ],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' },
        { id: 'c4', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [
        { title: 's1', count: 2 },
        { title: 's2', count: 2 }
      ],
      seed: '42'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'filter_by_unit',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u2', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: ['u1'] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u2', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: ['u1'] }],
      seed: '42'
    }),
    source: 'spec'
  });
}

function examSamplePart2(kit) {
  kit.sampleCases.push({
    name: 'filter_by_tag',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: ['tag1'], type: 't1' },
        { id: 'c2', unit: 'u1', tags: ['tag2'], type: 't1' },
        { id: 'c3', unit: 'u1', tags: ['tag1'], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, tags: ['tag1'] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: ['tag1'], type: 't1' },
        { id: 'c2', unit: 'u1', tags: ['tag2'], type: 't1' },
        { id: 'c3', unit: 'u1', tags: ['tag1'], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, tags: ['tag1'] }],
      seed: '42'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'filter_by_type',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't2' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, types: ['t1'] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't2' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, types: ['t1'] }],
      seed: '42'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'shortage',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 5 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 5 }],
      seed: '42'
    }),
    source: 'spec'
  });
}

function examSamplePart3(kit) {
  kit.sampleCases.push({
    name: 'count_0',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 0 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 0 }],
      seed: '42'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'empty_candidates',
    input: {
      candidates: [],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'same_seed_same_input',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '100'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '100'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'different_seeds_differ',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 1 }],
      seed: '101'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 1 }],
      seed: '101'
    }),
    source: 'spec'
  });
}

function examSamplePart4(kit) {
  kit.sampleCases.push({
    name: 'large_pool',
    input: {
      candidates: Array.from({ length: 30 }, (_, i) => ({
        id: `c${i + 1}`,
        unit: 'u1',
        tags: [],
        type: 't1'
      })),
      sections: [{ title: 's1', count: 10 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: Array.from({ length: 30 }, (_, i) => ({
        id: `c${i + 1}`,
        unit: 'u1',
        tags: [],
        type: 't1'
      })),
      sections: [{ title: 's1', count: 10 }],
      seed: '42'
    }),
    source: 'spec'
  });

  kit.sampleCases.push({
    name: 'empty_filter_list_passes_nothing',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: [] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: [] }],
      seed: '42'
    }),
    source: 'spec'
  });

  // F10a: stimulus-group fill repair
  const grp = (stim, n) => Array.from({ length: n }, (_, k) => ({ id: `${stim}-${k + 1}`, unit: 'u1', tags: [], type: 'choice', stimulus: stim }));
  kit.repairCase = (name, sizes, count, seed) => {
    const input = {
      candidates: sizes.flatMap((n, i) => grp(`g${i + 1}`, n)),
      sections: [{ title: 's1', count }],
      seed: String(seed)
    };
    kit.sampleCases.push({ name, input, expect: sampleJs(input), source: 'f10a' });
  };
  // kit.groups 3,2,2 into 4: greedy stalls at 3 whenever the 3-group comes first; repair gives 2+2
  for (const seed of [1, 2, 3, 4, 5, 6]) kit.repairCase(`sample_repair_fills_seed_${seed}`, [3, 2, 2], 4, seed);
  // kit.groups 2,2,2,2 into 5: several optimal subsets (sum 4), the shuffle picks which
  for (const seed of [7, 8]) kit.repairCase(`sample_repair_tie_seed_${seed}`, [2, 2, 2, 2], 5, seed);
  // kit.groups 4,4 into 5: best sum is 4, still short
  kit.repairCase('sample_repair_unfixable_still_short', [4, 4], 5, 42);
}

module.exports = { examSplitmix64Part1, examSamplePart1, examSamplePart2, examSamplePart3, examSamplePart4 };
