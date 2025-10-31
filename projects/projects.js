import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

const titleElement = document.querySelector('.projects-title');
titleElement.textContent = `Projects (${projects.length})`;

renderProjects(projects, projectsContainer, 'h2');

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let query = '';
const searchInput = document.querySelector('.searchBar');


function setQuery(val) {
  query = val;
  return projects.filter((project) => project.title.includes(query));
}

let selectedIndex = -1

function renderPieChart(projectsGiven) {
    // Re-calculate rolled data
    let newRolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year
      );
    
      // Re-calculate data
      let newData = newRolledData.map(([year, count]) => ({
        value: count,
        label: year,
      }));
    
      // Re-calculate slice generator, arc data, arcs, etc.
      let newSliceGenerator = d3.pie().value((d) => d.value);
      let newArcData = newSliceGenerator(newData);
      let newArc = d3.arc().innerRadius(0).outerRadius(50);
      let newArcs = newArcData.map((d) => newArc(d));
    
      // Clear up paths and legends
      let svg = d3.select('#projects-pie-plot');
      svg.selectAll('path').remove();
    
      let legend = d3.select('.legend');
      legend.selectAll('li').remove();
    
      // Colors
      let colors = d3.scaleOrdinal(d3.schemeTableau10);
    
      // Draw wedges (paths)
      newArcs.forEach((arc, i) => {
        svg
          .append('path')
          .attr('d', arc)
          .attr('fill', colors(i))
          .attr('style', `--color:${colors(i)}`)
          .attr('class', i === selectedIndex ? 'selected' : null)
          .on('click', () => {  // toggle selection
            selectedIndex = selectedIndex === i ? -1 : i;
          
            // update selected classes (keep existing pie in place)
            svg.selectAll('path')
               .attr('class', (_, idx) => (idx === selectedIndex ? 'selected' : null));
          
            legend.selectAll('li')
                  .attr('class', (_, idx) =>
                    idx === selectedIndex ? 'legend-item selected' : 'legend-item'
                  );
          
            // --- filter only the project CARDS ---
            if (selectedIndex === -1) {
              renderProjects(projects, projectsContainer, 'h2');
              // redraw pie with FULL data so you can pick a different year
              renderPieChart(projects);     // uses full dataset
            } else {
              const yearLabel = String(newData[selectedIndex].label);
              const filtered = projects.filter(p => String(p.year) === yearLabel);
          
              renderProjects(filtered, projectsContainer, 'h2');
              // redraw pie with FULL data (not filtered) so other wedges remain clickable
              renderPieChart(projects);     // <-- key change
            }
          });
      });
    
      // Draw legend items
      newData.forEach((d, i) => {
        legend
          .append('li')
          .attr('class', i === selectedIndex ? 'legend-item selected' : 'legend-item')
          .attr('style', `--color:${colors(i)}`)
          .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
      });
}


renderPieChart(projects);


searchInput.addEventListener('input', (event) => {
  let filteredProjects = setQuery(event.target.value);
  renderProjects(filteredProjects, projectsContainer, 'h2');
  renderPieChart(filteredProjects);
});

