console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}



let pages = [
    { url: '', title: 'Home' },
    { url: 'projects/', title: 'Projects' },
    { url: 'resume/', title: 'Resume' },
    { url: 'contact/', title: 'Contact' },
    { url: 'https://github.com/stephmuna', title: 'GitHub' },
    { url: 'meta/', title: 'Meta' },
    
  ];

  let nav = document.createElement('nav');
  document.body.prepend(nav);
  
  const BASE_PATH = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/"                  // Local server
    : "/portfolio/";         // GitHub Pages repo name
  
  for (let p of pages) {
    let url = p.url;
    let title = p.title;
  
    
    url = !url.startsWith('http') ? BASE_PATH + url : url;
  
    // Create link and add it to nav
    let a = document.createElement('a');
    a.href = url;
    a.textContent = title;
    nav.append(a);

    if (a.host === location.host && a.pathname === location.pathname) {
        a.classList.add('current');
    }
    
    if (a.host !== location.host) {
        a.target = "_blank";
    }
  }

  document.body.insertAdjacentHTML(
    'afterbegin',
    `
      <label class="color-scheme">
          Theme:
          <select>
              <option value="light dark">Automatic</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
          </select>
      </label>`,
  );

  const select = document.querySelector('.color-scheme select')

  select.addEventListener('input', function (event) {
    console.log('color scheme changed to', event.target.value);
    document.documentElement.style.setProperty('color-scheme', event.target.value);
    localStorage.colorScheme = event.target.value;
  });


  if ('colorScheme' in localStorage) {
    document.documentElement.style.setProperty('color-scheme', localStorage.colorScheme);
    select.value = localStorage.colorScheme;
  }


  
const form = document.querySelector('form[action^="mailto:"]');

form?.addEventListener('submit', (event) => {
  event.preventDefault(); 

  const data = new FormData(form);

  const params = [];
  for (let [name, value] of data) {
    
    params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }

  const sep = form.action.includes('?') ? '&' : '?';
  const url = form.action + (params.length ? sep + params.join('&') : '');

  location.href = url; 
});
export async function fetchJSON(url) {
  try {
    // Fetch the JSON file from the given URL
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
  }
}
export function renderProjects(project, containerElement, headingLevel = 'h2') {
  containerElement.innerHTML = '';

  for (const p of project) {
    const article = document.createElement('article');

    const linkHTML = p.url
    ? `<p class="project-link">
         <a href="${p.url}" target="_blank" rel="noopener noreferrer">
           View project →
         </a>
       </p>`
    : '';
    
    article.innerHTML = `
      <${headingLevel}>${p.title}</${headingLevel}>
      <img src="${p.image}" alt="${p.title}">
      <div class="project-body">
        <p>${p.description}</p>
        <p class="project-year"><em>c. ${p.year}</em></p>
        ${linkHTML}
      </div>
    `;
    containerElement.appendChild(article);
  }
}

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}



  

  
  





  