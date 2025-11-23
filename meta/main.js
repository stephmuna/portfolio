import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';


// ---------- GLOBALS ----------
let xScale;
let yScale;

let RAW_ROWS = [];          // original CSV rows
let COMMITS = [];           // processed rows (hourFrac, totalLines, etc.)
let FILTERED_ROWS = [];     // filtered rows for stats
let FILTERED_COMMITS = [];  // filtered rows for scatter

let commitProgress = 100;   // 0–100
let timeScale;
let commitMaxTime;

let LINES_BY_COMMIT = new Map();

let colors = d3.scaleOrdinal(d3.schemeTableau10);

// ---------- DATA LOADING & PROCESSING ----------

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => {
    let parsedLines = [];
    if (row.lines) {
      try {
        parsedLines = JSON.parse(row.lines);
      } catch {
        parsedLines = [];
      }
    }

    return {
      ...row,
      line: Number(row.line),
      depth: Number(row.depth),
      length: Number(row.length),
      date: new Date(row.date + 'T00:00' + row.timezone),
      datetime: new Date(row.datetime),
      lines: parsedLines,
    };
  });
  return data;
}

function processCommits(data) {
  const commits = data.map((d) => ({
    ...d,
    hourFrac: d.datetime.getHours() + d.datetime.getMinutes() / 60,
    totalLines: d.length,
  }));

  
  commits.sort((a, b) => a.datetime - b.datetime);

  return commits;
}

// ---------- SUMMARY STATS ----------

function renderCommitInfo(rows) {
  d3.select('#stats').selectAll('*').remove();

  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(rows.length);

  const totalCommits = new Set(rows.map((d) => d.commit)).size;
  dl.append('dt').text('Total commits');
  dl.append('dd').text(totalCommits);

  const fileCount = d3.group(rows, (d) => d.file).size;
  dl.append('dt').text('Files');
  dl.append('dd').text(fileCount);

  const maxDepth = d3.max(rows, (d) => d.depth);
  dl.append('dt').text('Max depth');
  dl.append('dd').text(maxDepth ?? 0);

  const avgDepth = d3.mean(rows, (d) => d.depth);
  dl.append('dt').text('Avg depth');
  dl.append('dd').text(avgDepth?.toFixed(2) ?? '0');

  const longestLine = d3.greatest(rows, (d) => d.length);
  dl.append('dt').text('Longest line (chars)');
  dl.append('dd').text(longestLine ? longestLine.length : 0);
}

// ---------- TOOLTIP ----------

function renderTooltipContent(commit) {
  if (!commit || Object.keys(commit).length === 0) return;

  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');

  link.textContent = commit.commit;
  link.removeAttribute('href'); // no URL in this dataset

  date.textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });

  document.getElementById('commit-time-tooltip').textContent =
    commit.datetime?.toLocaleString('en', { timeStyle: 'short' }) ?? '';

  document.getElementById('commit-author').textContent =
    commit.author || '—';

  const sumForCommit =
    LINES_BY_COMMIT.get(commit.commit) ??
    (commit.totalLines ?? commit.length ?? 0);

  document.getElementById('commit-lines').textContent =
    `${sumForCommit} lines`;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

// ---------- BRUSH HELPERS / SELECTION ----------

function isCommitSelected(selection, commit) {
  if (!selection) return false;

  const [[x0, y0], [x1, y1]] = selection;

  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selected = selection
    ? FILTERED_COMMITS.filter((d) => isCommitSelected(selection, d))
    : [];

  const ids = new Set(selected.map((d) => d.commit));
  const n = ids.size;

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${n ? n : 'No'} commit${n === 1 ? '' : 's'} selected`;

  return selected;
}

function renderLanguageBreakdown(selection) {
  const container = document.getElementById('language-breakdown');
  const selected = selection
    ? FILTERED_COMMITS.filter((d) => isCommitSelected(selection, d))
    : [];

  if (selected.length === 0) {
    container.innerHTML = '';
    return;
  }

  const perLang = d3.rollup(
    selected,
    (v) => v.length,
    (d) => d.type
  );

  const total = Array.from(perLang.values()).reduce((a, b) => a + b, 0) || 1;

  container.innerHTML = '';
  for (const [lang, count] of perLang) {
    const pct = d3.format('.1~%')(count / total);
    container.innerHTML += `
      <div class="lang-block">
        <div class="lang-title">${lang.toUpperCase()}</div>
        <div class="lang-lines">${count} commits</div>
        <div class="lang-pct">(${pct})</div>
      </div>
    `;
  }
}

function brushed(event) {
  const selection = event.selection;

  // If brush is cleared, just reset selection UI and STOP.
  if (!selection) {
    d3.selectAll('circle').classed('selected', false);
    renderSelectionCount(null);
    renderLanguageBreakdown(null);
    return;
  }

  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d)
  );

  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// ---------- SCATTERPLOT: INITIAL RENDER ----------

function renderScatterPlot(commits) {
  const points = d3.groups(commits, (d) => d.commit).map(([_, v]) => v[0]);
  const sortedCommits = d3.sort(points, (d) => -d.totalLines);

  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 36 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width)
  );

  const xAxis = d3.axisBottom(xScale);
  const yAxisFormatted = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxisFormatted);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([5, 30]);

  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.commit)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', () => {
      updateTooltipVisibility(false);
      d3.selectAll('circle').style('fill-opacity', 0.7);
    });

  svg.call(d3.brush().on('start brush end', brushed));
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// ---------- SCATTERPLOT: UPDATE FOR SLIDER ----------

function updateScatterPlot(commits) {
  const svg = d3.select('#chart').select('svg');
  if (svg.empty()) return;

  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 36 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([5, 30]);

  const xAxis = d3.axisBottom(xScale);
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  const dots = svg.select('g.dots');
  const points = d3.groups(commits, (d) => d.commit).map(([_, v]) => v[0]);
  const sorted = d3.sort(points, (d) => -d.totalLines);

  dots
    .selectAll('circle')
    .data(sorted, (d) => d.commit)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', () => {
      updateTooltipVisibility(false);
      d3.selectAll('circle').style('fill-opacity', 0.7);
    });
}



// ---------- FILE DISPLAY (Step 2.1) ----------

function updateFileDisplay(rows) {
  
  // 1. Group rows by file, keep the full row objects as "lines"
  const files = d3
    .groups(rows, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);   // 👈 NEW: sort desc by #lines

  // 2. Bind files to <div> children of #files
  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append('div').call((div) => {
        div.append('dt').append('code');
        div.append('dd');
      })
    );

  // 3. DT: filename + line count
  filesContainer
    .select('dt')
    .html((d) => `
      <code>${d.name}</code>
      <small>${d.lines.length} lines</small>
    `);

  // 4. DD: one .loc per line (unit visualization)
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .style('--color', d => colors(d.type)); 
}



// ---------- SLIDER HANDLER ----------

function onTimeSliderChange(event) {
  const rawVal =
    typeof event?.target?.value !== 'undefined'
      ? event.target.value
      : commitProgress;

  commitProgress = Number(rawVal);

  commitMaxTime = timeScale.invert(commitProgress);

  document.getElementById('commit-time').textContent =
    commitMaxTime.toLocaleString('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

  FILTERED_ROWS = RAW_ROWS.filter((d) => d.datetime <= commitMaxTime);
  FILTERED_COMMITS = COMMITS.filter((d) => d.datetime <= commitMaxTime);

  LINES_BY_COMMIT = d3.rollup(
    FILTERED_COMMITS,
    (v) => d3.sum(v, (d) => d.totalLines ?? d.length ?? 0),
    (d) => d.commit
  );

  renderCommitInfo(FILTERED_ROWS);
  updateScatterPlot(FILTERED_COMMITS);
  updateFileDisplay(FILTERED_ROWS);
}

// ---------- MAIN ----------

const raw = await loadData();
RAW_ROWS = raw;
COMMITS = processCommits(raw);

FILTERED_ROWS = RAW_ROWS;
FILTERED_COMMITS = COMMITS;

LINES_BY_COMMIT = d3.rollup(
  COMMITS,
  (v) => d3.sum(v, (d) => d.totalLines ?? d.length ?? 0),
  (d) => d.commit
);

timeScale = d3
  .scaleTime()
  .domain(d3.extent(COMMITS, (d) => d.datetime))
  .range([0, 100]);

commitMaxTime = timeScale.invert(commitProgress);

renderCommitInfo(RAW_ROWS);
renderScatterPlot(COMMITS);
updateFileDisplay(RAW_ROWS);

const slider = document.getElementById('commit-progress');
if (slider) {
  slider.addEventListener('input', onTimeSliderChange);
  slider.addEventListener('change', onTimeSliderChange);
  onTimeSliderChange({ target: slider });
}

// ---------- SCROLLY TEXT FOR EACH COMMIT ----------

// Group all raw rows by commit id, then build a summary per commit
const commitSummaries = d3
  .groups(RAW_ROWS, (d) => d.commit)
  .map(([commitId, rows]) => {
    const datetime = rows[0].datetime; // use first row's datetime for that commit
    const totalLines = rows.length;    // each row ≈ one line in this lab
    const filesCount = d3.rollups(
      rows,
      (v) => v.length,
      (d) => d.file
    ).length;
  

    return { commitId, datetime, totalLines, filesCount };
  })
  .sort((a, b) => a.datetime - b.datetime); // sort by datetime ascending

// Create one .step div per commit inside #scatter-story
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commitSummaries)
  .join('div')
  .attr('class', 'step')
  .html((d, i) => `
    <p>
      On
      <strong>${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })}</strong>,
      I made
      <strong>${i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'}</strong>.
    </p>
    <p>
      I edited <strong>${d.totalLines}</strong> lines
      across <strong>${d.filesCount}</strong> files.
      Then I looked over all I had made, and I saw that it was very good.
    </p>
  `);

  // ---------- SCROLLAMA SETUP ----------

function onStepEnter(response) {
  const commit = response.element.__data__;

  // The commit’s datetime from your commitSummaries
  const t = commit.datetime;

  
  FILTERED_ROWS = RAW_ROWS.filter((d) => d.datetime <= t);
  FILTERED_COMMITS = COMMITS.filter((d) => d.datetime <= t);

  
  LINES_BY_COMMIT = d3.rollup(
    FILTERED_COMMITS,
    (v) => d3.sum(v, (d) => d.totalLines ?? d.length ?? 0),
    (d) => d.commit
  );

  
  renderCommitInfo(FILTERED_ROWS);
  updateScatterPlot(FILTERED_COMMITS);
  updateFileDisplay(FILTERED_COMMITS);
}

const scroller = scrollama();

scroller.setup({
  container: '#scrolly-1',
  step: '#scrolly-1 .step',
})
.onStepEnter(onStepEnter);





