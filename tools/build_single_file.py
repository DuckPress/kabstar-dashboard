#!/usr/bin/env python3
"""
Build a one-file copy of the dashboard for easy sharing.

Inlines every stylesheet in css/ and every script in js/ into index.html and
embeds the home-screen icon, so the result is a single .html file that can be
sent to a phone, put on any web host or opened straight from a download
(double-clicking works, unlike the split version, which needs a local server).
Chart.js, Leaflet and the Inter font still load from their CDNs (the page needs
internet for live data anyway).

How the scripts are combined: the files in js/ are ES modules. Starting from
js/main.js, each file is placed after the files it imports (the same order the
browser runs them in), its import lines are dropped and its "export" keywords
removed, and the lot is wrapped in one strict-mode function so nothing leaks
into the global scope.

Left out on purpose (they need separate files next to the page):
  - the service worker (sw.js): no offline cache in the single-file copy
  - the web-app manifest: "Add to Home Screen" still works, using the icon

Re-run after editing the dashboard:
    python build_single_file.py            -> KAB-STAR-dashboard.html
    python build_single_file.py -o out.html
"""
import argparse
import base64
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
# The dashboard sits next to this tools folder, or in "4 Dashboard" in the
# numbered FYP file set.
ROOT = next((d for d in (PARENT, os.path.join(PARENT, '4 Dashboard'))
             if os.path.isfile(os.path.join(d, 'index.html'))), PARENT)

IMPORT_RE = re.compile(r"^import\s*\{[^}]*\}\s*from\s*'([^']+)';[ \t]*\n", re.M)
EXPORT_RE = re.compile(r'^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)', re.M)


def read(name, mode='r'):
    p = os.path.join(ROOT, name)
    return open(p, 'rb').read() if mode == 'rb' else open(p, encoding='utf-8').read()


def replace_once(text, pattern, repl, what):
    new, n = re.subn(pattern, lambda m: repl, text, count=1)
    if n != 1:
        sys.exit(f'build_single_file: could not find the {what} in index.html')
    return new


def module_order(entry):
    """Files in the order the browser evaluates them: imports first (depth-first)."""
    order, seen = [], set()

    def visit(rel):
        if rel in seen:
            return
        seen.add(rel)
        src = read(rel)
        for dep in IMPORT_RE.findall(src):
            visit(os.path.normpath(os.path.join(os.path.dirname(rel), dep)).replace('\\', '/'))
        order.append(rel)

    visit(entry)
    return order


def main():
    global ROOT
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--root', default=ROOT, help='dashboard folder (default: found next to this script)')
    ap.add_argument('-o', '--out', help='output file (default: KAB-STAR-dashboard.html in the dashboard folder)')
    a = ap.parse_args()
    ROOT = a.root
    a.out = a.out or os.path.join(ROOT, 'KAB-STAR-dashboard.html')

    html = read('index.html')

    # Styles: the <link>s to css/*.css, in the page's own order.
    css_files = re.findall(r'<link rel="stylesheet" href="(css/[^"]+\.css)">', html)
    if not css_files:
        sys.exit('build_single_file: no css/*.css links found in index.html')
    css = '\n'.join(f'/* ── {f} ── */\n' + read(f) for f in css_files).replace('</style', '<\\/style')
    html = re.sub(r'(?:[ \t]*<link rel="stylesheet" href="css/[^"]+\.css">\n)+',
                  lambda m: '<style>\n' + css + '\n</style>\n', html, count=1)

    # Scripts: every module reachable from js/main.js, dependencies first.
    parts = []
    for rel in module_order('js/main.js'):
        src = EXPORT_RE.sub('', IMPORT_RE.sub('', read(rel)))
        if re.search(r'^\s*(import|export)\b', src, re.M):
            sys.exit(f'build_single_file: {rel} has an import/export this script cannot inline')
        parts.append(f'/* ── {rel} ── */\n{src}')
    js = ("(function () {\n'use strict';\n" + '\n'.join(parts) + '\n})();').replace('</script', '<\\/script')
    html = replace_once(html, r'<script type="module" src="js/main\.js"></script>',
                        '<script>window.KAB_SINGLE_FILE = true;</script>\n<script>\n' + js + '\n</script>',
                        'js/main.js script tag')

    icon = base64.b64encode(read('apple-touch-icon.png', 'rb')).decode('ascii')
    html = replace_once(html, r'href="apple-touch-icon\.png"',
                        'href="data:image/png;base64,' + icon + '"', 'apple-touch-icon link')
    html = replace_once(html, r'\s*<link rel="manifest" href="manifest\.webmanifest"\s*/?>', '', 'manifest link')

    # Nothing may still point at a file that isn't in the single copy.
    for local in ('css/', 'js/', 'sw.js', 'manifest.webmanifest', 'apple-touch-icon.png'):
        if re.search(r'(src|href)="' + re.escape(local), html):
            sys.exit(f'build_single_file: {local} is still referenced')

    open(a.out, 'w', encoding='utf-8', newline='\n').write(html)
    print(f'Wrote {a.out} ({os.path.getsize(a.out) / 1024:.0f} KB, {len(css_files)} stylesheets, {len(parts)} scripts)')


if __name__ == '__main__':
    main()
