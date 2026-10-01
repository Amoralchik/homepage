'use strict';

/* Ranks sites by how much they're used, so the new tab's "Most used" strip
   can list them. A site gains weight each time its tab is activated or
   finishes loading a page. Counts live in chrome.storage.local. */

const KEY = 'home:tabCounts';
const MAX_ENTRIES = 60;

function originOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin + '/' : null;
  } catch (e) { return null; }
}

// serialize read-modify-write cycles so rapid tab switches can't race
let queue = Promise.resolve();

function bump(tabId) {
  queue = queue.then(() => bumpNow(tabId)).catch(() => { });
}

async function bumpNow(tabId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (e) { return; }
  const origin = originOf(tab.url);
  if (!origin) return;

  const got = await chrome.storage.local.get(KEY);
  const data = got[KEY] || {};
  const e = data[origin] || { count: 0, url: origin, title: '', fav: '', last: 0 };
  e.count += 1;
  e.last = Date.now();
  if (tab.title) e.title = tab.title;
  if (tab.favIconUrl) e.fav = tab.favIconUrl;
  data[origin] = e;

  const keys = Object.keys(data);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => data[b].count - data[a].count);
    for (const k of keys.slice(MAX_ENTRIES)) delete data[k];
  }
  await chrome.storage.local.set({ [KEY]: data });
}

chrome.tabs.onActivated.addListener(({ tabId }) => bump(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') bump(tabId);
});
