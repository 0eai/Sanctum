// src/lib/bookmarkUtils.js
export const normalizeUrl = (url) => {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
};

export const getDomain = (url) => {
  try { return new URL(normalizeUrl(url)).hostname.replace('www.', ''); } 
  catch (e) { return 'link'; }
};

export const exportBookmarksToNetscapeHtml = (allItems) => {
  const buildFolder = (parentId, indent = 0) => {
    const children = allItems.filter(i => i.parentId === parentId);
    if (children.length === 0) return '';
    const pad = '    '.repeat(indent);
    let html = `${pad}<DL><p>\n`;
    for (const item of children) {
      if (item.type === 'folder') {
        html += `${pad}    <DT><H3>${item.title || 'Folder'}</H3>\n`;
        html += buildFolder(item.id, indent + 1);
      } else {
        const url = normalizeUrl(item.url || '');
        const title = (item.title || 'Untitled').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `${pad}    <DT><A HREF="${url}">${title}</A>\n`;
      }
    }
    html += `${pad}</DL><p>\n`;
    return html;
  };

  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    buildFolder(null)
  ].join('\n');
};

export const parseNetscapeHtml = (htmlContent) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  return doc.querySelector('dl');
};