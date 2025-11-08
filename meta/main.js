import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let xScale;
let yScale;
let COMMITS = []

let LINES_BY_COMMIT = new Map();

// after you have `commits` (your rows with .commit and .totalLines/.length):
LINES_BY_COMMIT = d3.rollup(
  COMMITS,
  v => d3.sum(v, d => (d.totalLines ?? d.length ?? 0)),
  d => d.commit
);


async function loadData() {
    const data = await d3.csv('loc.csv', (row) => ({
      ...row,
      line: Number(row.line), 
      depth: Number(row.depth),
      length: Number(row.length),
      date: new Date(row.date + 'T00:00' + row.timezone),
      datetime: new Date(row.datetime),
    }));
  
    return data;
  }

  function processCommits(data) {
    return data.map(d => ({
        ...d,
        hourFrac: d.datetime.getHours() + d.datetime.getMinutes() / 60,
        totalLines: d.length  
      }));
  }
  
  function renderCommitInfo(data, commits) {
    const dl = d3.select('#stats').append('dl').attr('class', 'stats');
  
    
    dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
    dl.append('dd').text(data.length);

    const totalCommits = new Set(data.map(d => d.commit)).size;
  
    dl.append('dt').text('Total commits');
    dl.append('dd').text(totalCommits);
  
    
  
    
    const fileCount = d3.group(data, d => d.file).size;
    dl.append('dt').text('Files');
    dl.append('dd').text(fileCount);
  
    
    const maxDepth = d3.max(data, d => d.depth);
    dl.append('dt').text('Max depth');
    dl.append('dd').text(maxDepth);
  
  
    const avgDepth = d3.mean(data, d => d.depth);
    dl.append('dt').text('Avg depth');
    dl.append('dd').text(avgDepth?.toFixed(2) ?? '0');
  
    
    const longestLine = d3.greatest(data, d => d.length);
    dl.append('dt').text('Longest line (chars)');
    dl.append('dd').text(longestLine ? longestLine.length : 0);
  
    
  }

  function renderTooltipContent(commit) {
    if (!commit || Object.keys(commit).length === 0) return;
  
    const link = document.getElementById('commit-link');
    const date = document.getElementById('commit-date');
  
    
    link.textContent = commit.commit;  // assuming your data has .id (hash)
    date.textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });

    document.getElementById('commit-time').textContent =
    commit.datetime?.toLocaleString('en', { timeStyle: 'short' });

  document.getElementById('commit-author').textContent =
    commit.author || '—';

    const sumForCommit = LINES_BY_COMMIT.get(commit.commit) ?? (commit.totalLines ?? commit.length ?? 0);
    document.getElementById('commit-lines').textContent = `${sumForCommit} lines`;

  }

  function createBrushSelector(svg) {
    svg.call(d3.brush());
  }

  function renderSelectionCount(selection) {
    const selectedRows = selection
      ? COMMITS.filter(d => isCommitSelected(selection, d))
      : [];
  
      const ids = new Set(selectedRows.map(d => d.commit));

      const countElement = document.querySelector('#selection-count');
      const n = ids.size;
      countElement.textContent = `${n ? n : 'No'} commit${n === 1 ? '' : 's'} selected`;
    
      return selectedRows; // keep return if other code uses it
    
    
  }
  
 

  function renderScatterPlot(data, commits) {
    
      const points = d3.groups(commits, d => d.commit).map(([_, v]) => v[0]);
      
      // Sort after grouping
      const sortedCommits = d3.sort(points, d => -d.totalLines);
    const width = 1000;
    const height = 600;

     // Usable area
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
  
    // Scales
    xScale = d3.scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([usableArea.left, usableArea.right])
  .nice();
      
  
  yScale = d3.scaleLinear()
  .domain([0, 24])
  .range([usableArea.bottom, usableArea.top]);



   

    xScale.range([usableArea.left, usableArea.right]);
    yScale.range([usableArea.bottom, usableArea.top]);

    // GRIDLINES 
        const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);
      
      // Create gridlines as an axis with no labels and full-width ticks
      gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

    //AXES
    const xAxis = d3.axisBottom(xScale);
    

    svg.append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .call(xAxis);

    

    const yAxisFormatted = d3.axisLeft(yScale)
    .tickFormat(d => String(d % 24).padStart(2, '0') + ':00');
      
    svg.append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(yAxisFormatted);

    const [minLines, maxLines] = d3.extent(commits, d => d.totalLines);

     const rScale = d3
            .scaleSqrt()
          .domain([minLines, maxLines])
          .range([5, 30]);
  
    // Draw dots
    const dots = svg.append('g').attr('class', 'dots');
  
    
      
    const tooltipEl = document.getElementById('commit-tooltip');

    dots.selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
  .style('fill-opacity', 0.7)
  .attr('fill', 'steelblue')
  .on('mouseenter', (event, commit) => {
    d3.select(event.currentTarget).style('fill-opacity', 1);
    renderTooltipContent(commit);
    updateTooltipVisibility(true);
    updateTooltipPosition(event);
  })
  .on('mouseleave', (event) => {
    d3.select(event.currentTarget).style('fill-opacity', 0.5);
    updateTooltipVisibility(false);
  });

  svg.call(
    d3.brush().on('start brush end', brushed)
  );
  
  // raise dots so tooltips still work
  svg.selectAll('.dots, .overlay ~ *').raise();
    
  }

  function renderLanguageBreakdown(selection) {
    const container = document.getElementById('language-breakdown');
  
    // Filter rows by the brush selection (pixel-space check)
    const selected = selection
      ? COMMITS.filter(d => isCommitSelected(selection, d))
      : [];
  
    // If nothing selected, clear panel (matches the spec)
    if (selected.length === 0) {
      container.innerHTML = '';
      return;
    }
  
    // We’ll measure “lines edited per language”
    // If you want “count of commits per language”, replace d.totalLines with 1
    const perLang = d3.rollup(
      selected,
      v => d3.sum(v, d => 1 ?? 0),
      d => d.type
    );
  
    // Total lines across selected rows
    const totalLines = Array.from(perLang.values()).reduce((a, b) => a + b, 0) || 1;
  
    // Render
    container.innerHTML = '';
    for (const [lang, lines] of perLang) {
      const pct = d3.format('.1~%')(lines / totalLines);
    
      container.innerHTML += `
        <div class="lang-block">
          <div class="lang-title">${lang.toUpperCase()}</div>
          <div class="lang-lines">${lines} lines</div>
          <div class="lang-pct">(${pct})</div>
        </div>
      `;
    }
  }

  function brushed(event) {
    const selection = event.selection;
    d3.selectAll('circle').classed('selected', (d) =>
      isCommitSelected(selection, d)
    );

    renderSelectionCount(selection); 
    renderLanguageBreakdown(selection);  
  }
  
  function isCommitSelected(selection, commit) {
    if (!selection) return false;
  
    const [[x0, y0], [x1, y1]] = selection;
  
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
  
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.hidden = !isVisible;
  }

  function updateTooltipPosition(event) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top  = `${event.clientY}px`;
  }
  
  
  const data = await loadData();
  const commits = processCommits(data);
    COMMITS = commits;
  renderCommitInfo(data, commits);
  renderScatterPlot(data, commits);