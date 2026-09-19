/**
 * Entry point, with the import of the app itself guarded.
 *
 * A throw while a module is still evaluating happens before React mounts, so
 * an error boundary inside the tree cannot catch it and the app simply launches
 * to a blank screen with nothing logged. Requiring App inside a try/catch means
 * that failure is displayed rather than silent.
 *
 * Everything here uses React.createElement and nothing beyond react-native, so
 * this path cannot fail for whatever reason the app did.
 */
import { registerRootComponent } from 'expo';
import React from 'react';
import { ScrollView, Text } from 'react-native';

function Crash({ title, detail }) {
  return React.createElement(
    ScrollView,
    { style: { flex: 1, backgroundColor: '#1A0C10' },
      contentContainerStyle: { padding: 18, paddingTop: 70 } },
    React.createElement(
      Text,
      { style: { color: '#FF8FA6', fontSize: 17, fontWeight: '800', marginBottom: 10 } },
      title
    ),
    React.createElement(
      Text,
      { style: { color: '#FFD7DF', fontSize: 11, lineHeight: 16 }, selectable: true },
      detail
    )
  );
}

let Root;
try {
  Root = require('./App').default;
  if (typeof Root !== 'function') {
    const kind = Root === undefined ? 'undefined' : typeof Root;
    Root = () => Crash({ title: 'App did not export a component', detail: `got ${kind}` });
  }
} catch (e) {
  const detail = (e && (e.stack || e.message)) || String(e);
  Root = () => Crash({ title: 'Pocket Arcade failed to load', detail: String(detail) });
}

registerRootComponent(Root);
