const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(process.cwd(), 'frontend', 'index.html');

export async function getServerSideProps({ res }) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.write(html);
  res.end();
  return { props: {} };
}

export default function Index() {
  return null;
}
