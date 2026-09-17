import fs from 'fs';

let content = fs.readFileSync('server/routes.ts', 'utf8');

if (!content.includes('import { fetchIgdbPoster, fetchIgdbPostersBatch }')) {
  content = content.replace(
    /import { fetchFromRawg.*? } from "\.\/rawg";/,
    `import { fetchFromRawg, mapRawgGame, fetchCuratedLists, cachedFetchFromRawg } from "./rawg";\nimport { fetchIgdbPoster, fetchIgdbPostersBatch } from "./igdb-posters";`
  );
}

// Helper to inject batch fetch logic
function injectBatchLogic(endpointStr: string) {
    return `const mapped = results.map(mapRawgGame);\n    const posterMap = await fetchIgdbPostersBatch(mapped.map((g: any) => g.title));\n    mapped.forEach((g: any) => {\n      if (posterMap[g.title]) g.poster_url = posterMap[g.title];\n    });\n    res.json(mapped);`;
}

// /discover/search
content = content.replace(
    /const results = Array\.isArray\(data\?\.results\) \? data\.results : \[\];\n\s+res\.json\(results\.map\(mapRawgGame\)\);/,
    `const results = Array.isArray(data?.results) ? data.results : [];\n    const mapped = results.map(mapRawgGame);\n    const posterMap = await fetchIgdbPostersBatch(mapped.map((g: any) => g.title));\n    mapped.forEach((g: any) => {\n      if (posterMap[g.title]) g.poster_url = posterMap[g.title];\n    });\n    res.json(mapped);`
);

// /discover/trending
content = content.replace(
    /const results = Array\.isArray\(data\?\.results\) \? data\.results : \[\];\n\s+res\.json\(results\.map\(mapRawgGame\)\);/,
    `const results = Array.isArray(data?.results) ? data.results : [];\n    const mapped = results.map(mapRawgGame);\n    const posterMap = await fetchIgdbPostersBatch(mapped.map((g: any) => g.title));\n    mapped.forEach((g: any) => {\n      if (posterMap[g.title]) g.poster_url = posterMap[g.title];\n    });\n    res.json(mapped);`
);

// /discover/game/:rawgId
content = content.replace(
    /res\.json\(mapRawgGame\(data\)\);/,
    `const mapped = mapRawgGame(data);\n    const igdbPoster = await fetchIgdbPoster(mapped.title);\n    if (igdbPoster) mapped.poster_url = igdbPoster;\n    res.json(mapped);`
);

// /discover/lists
content = content.replace(
    /const lists = await fetchCuratedLists\(\);\n\s+res\.json\(lists\);/,
    `const lists = await fetchCuratedLists();\n    const allTitles = [\n      ...lists.topThisMonth.map((g: any) => g.title),\n      ...lists.bestAllTime.map((g: any) => g.title),\n      ...lists.newReleases.map((g: any) => g.title),\n      ...lists.mostHyped.map((g: any) => g.title)\n    ];\n    const posterMap = await fetchIgdbPostersBatch(allTitles);\n    const applyPosters = (list: any[]) => list.forEach((g: any) => {\n      if (posterMap[g.title]) g.poster_url = posterMap[g.title];\n    });\n    applyPosters(lists.topThisMonth);\n    applyPosters(lists.bestAllTime);\n    applyPosters(lists.newReleases);\n    applyPosters(lists.mostHyped);\n    res.json(lists);`
);

fs.writeFileSync('server/routes.ts', content);
