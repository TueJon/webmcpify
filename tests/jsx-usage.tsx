/**
 * CI fixture — proves templates/webmcp-jsx.d.ts makes the declarative WebMCP
 * attributes typecheck in strict TSX (compiled by tsconfig.jsx.json; never
 * shipped, never rendered). Removing webmcp-jsx.d.ts from the config must make
 * this file FAIL with TS2322 — the augmentation is load-bearing.
 */
import * as React from 'react';

export function ContactForm(): React.JSX.Element {
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const native = e.nativeEvent as SubmitEvent; // webmcp.d.ts global augmentation
    if (native.agentInvoked) {
      native.respondWith?.(Promise.resolve('ok')); // pass the PROMISE
    }
  };
  return (
    <form
      toolname="send_contact_message"
      tooldescription="Sends a message to the site owner. A reply arrives within one business day."
      onSubmit={onSubmit}
    >
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        toolparamdescription="Email address for the reply"
      />
      <label htmlFor="topic">Topic</label>
      <select id="topic" name="topic" toolparamdescription="Message topic">
        <option value="general">General</option>
        <option value="quote">Quote</option>
      </select>
      <label htmlFor="message">Message</label>
      <textarea id="message" name="message" required toolparamdescription="The message body" />
      <fieldset toolparamdescription="Preferred reply channel">
        <label>
          <input type="radio" name="channel" value="email" /> Email
        </label>
        <label>
          <input type="radio" name="channel" value="phone" /> Phone
        </label>
      </fieldset>
      <button type="submit">Send</button>
    </form>
  );
}

export function SearchForm(): React.JSX.Element {
  return (
    // toolautosubmit="" — boolean-attribute style; allowed ONLY on pure read forms
    <form toolname="search_site" tooldescription="Searches the site." toolautosubmit="">
      <input name="query" toolparamdescription="Search terms, exactly as the user phrased them" />
      <button type="submit">Search</button>
    </form>
  );
}
