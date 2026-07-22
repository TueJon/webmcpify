import { createToolScope } from '../../skills/webmcpify/templates/webmcpify.js';
import { applyFilter } from './app.js';

const schema = {
  type: 'object',
  properties: { category: { type: 'string', enum: ['all', 'feature', 'fix'] } },
  required: ['category'],
  additionalProperties: false,
};

window.addEventListener('webmcpify:integrate', () => {
  createToolScope('proof-release-notes', [{
    name: 'set_release_filter',
    description: 'Filters the visible synthetic release notes by category using the page existing filter path.',
    inputSchema: schema,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: ({ category }) => {
      if (!schema.properties.category.enum.includes(category)) {
        return 'ERROR: category must be one of all, feature, or fix.';
      }
      const count = applyFilter(category);
      return `${count} release notes visible for ${category}.`;
    },
  }]);
}, { once: true });
