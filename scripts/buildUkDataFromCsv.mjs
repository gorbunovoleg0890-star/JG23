import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Parse CSV with proper handling of quoted fields
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = parseCSVLine(lines[0]);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    records.push(record);
  }

  return records;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Build articles structure from CSV records
function buildArticlesStructure(records) {
  const articlesMap = new Map();

  records.forEach((record) => {
    const articleId = record.article_id ? record.article_id.replace(/^'/, '') : '';
    const title = record.article_title || '';
    const part = record.part || '';
    const points = record.points || '';

    if (!articleId) return;

    if (!articlesMap.has(articleId)) {
      articlesMap.set(articleId, {
        id: articleId,
        title: title,
        parts: new Set(),
        pointsByPart: {}
      });
    }

    const article = articlesMap.get(articleId);

    if (part) {
      article.parts.add(part);
      if (points) {
        article.pointsByPart[part] = points.split(';').map(p => p.trim()).filter(p => p);
      }
    }
  });

  // Convert Sets to sorted arrays
  const articles = Array.from(articlesMap.values())
    .map(article => ({
      id: article.id,
      title: article.title,
      parts: Array.from(article.parts).sort((a, b) => {
        const aNum = parseInt(a, 10);
        const bNum = parseInt(b, 10);
        return aNum - bNum;
      }),
      pointsByPart: article.pointsByPart
    }))
    .sort((a, b) => {
      const aNum = parseFloat(a.id);
      const bNum = parseFloat(b.id);
      return aNum - bNum;
    });

  return articles;
}

// Generate helper functions code
function generateHelperFunctions() {
  return `
export function getArticleOptions() {
  return ukArticles.map(article => ({
    value: article.id,
    label: \`Статья \${article.id} УК РФ - \${article.title}\`
  }));
}

export function getPartsForArticle(articleId) {
  const article = ukArticles.find(a => a.id === articleId);
  return article ? article.parts : [];
}

export function getPointsForArticlePart(articleId, part) {
  const article = ukArticles.find(a => a.id === articleId);
  if (!article || !article.pointsByPart[part]) {
    return [];
  }
  return article.pointsByPart[part];
}`;
}

// Main execution
function main() {
  try {
    // Read CSV file
    const csvPath = resolve(__dirname, '../src/data/ukrf_articles_105_361.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');

    // Parse CSV
    const records = parseCSV(csvContent);

    // Build articles structure
    const articles = buildArticlesStructure(records);

    // Generate output file
    const articleLines = articles.map(article => {
      const pointsByPartStr = Object.entries(article.pointsByPart)
        .map(([part, points]) => {
          const pointsStr = JSON.stringify(points);
          return `"${part}":${pointsStr}`;
        })
        .join(',');

      return `  { id: "${article.id}", title: "${article.title.replace(/"/g, '\\"')}", parts:[${article.parts.map(p => `"${p}"`).join(',')}], pointsByPart:{ ${pointsByPartStr} } }`;
    });

    const fileContent = `export const ukArticles = [
${articleLines.join(',\n')}
];
${generateHelperFunctions()}
`;

    // Write output file
    const outputPath = resolve(__dirname, '../src/data/ukData.js');
    writeFileSync(outputPath, fileContent, 'utf-8');

    console.log(`✓ Generated ukData.js with ${articles.length} articles`);
  } catch (error) {
    console.error('Error building ukData.js:', error.message);
    process.exit(1);
  }
}

main();
