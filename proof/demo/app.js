const notes = [...document.querySelectorAll('[data-category]')];

export function applyFilter(category) {
  let visible = 0;
  for (const note of notes) {
    const show = category === 'all' || note.dataset.category === category;
    note.hidden = !show;
    if (show) visible++;
  }
  document.querySelectorAll('[data-filter]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
  document.querySelector('#visible-count').textContent = `${visible} release notes visible`;
  return visible;
}

document.querySelectorAll('[data-filter]').forEach((button) =>
  button.addEventListener('click', () => applyFilter(button.dataset.filter)));

const log = document.querySelector('#log');
window.proof = {
  phase(name, title) {
    document.querySelectorAll('#phases span').forEach((item) => {
      const phases = ['inventory', 'gate', 'integrate', 'verify', 'audit'];
      const current = phases.indexOf(name);
      const itemIndex = phases.indexOf(item.dataset.phase);
      item.className = itemIndex < current ? 'done' : itemIndex === current ? 'active' : '';
    });
    document.querySelector('#phase-label').textContent = name.toUpperCase();
    document.querySelector('#proof-title').textContent = title;
  },
  line(text) { log.textContent += `${text}\n`; log.scrollTop = log.scrollHeight; },
  manifest(show = true) { document.querySelector('#manifest').hidden = !show; },
  gate() { document.querySelector('#gate').showModal(); },
  check(text) {
    document.querySelector('#checks').insertAdjacentHTML('beforeend', `<div class="check">✓ ${text}</div>`);
    log.scrollTop = log.scrollHeight;
  },
  chrome(version) { document.querySelector('#chrome').textContent = `Chrome ${version} · native document.modelContext`; },
};

document.querySelector('#approve').addEventListener('click', () => {
  document.querySelector('#gate').close();
  window.dispatchEvent(new CustomEvent('webmcpify:approved'));
});
