require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3003;
const BUCKET = 'crd-files';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const app = express();

function asArr(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

function fileEntry(f, number, kind) {
  return {
    name: f.name, type: f.type, size: f.size, kind: kind,
    url: '/api/file?case=' + encodeURIComponent(number) + '&path=' + encodeURIComponent(f.path) + '&name=' + encodeURIComponent(f.name || 'file')
  };
}

app.get('/api/cases', async (req, res) => {
  const { data } = await supabase.from('crd_cases')
    .select('number, subject_username, status, department, date_opened, subject_matter, proof, documents')
    .eq('confidentiality', 'public').eq('classified', false)
    .order('date_opened', { ascending: false });
  const cases = (data || []).map((c) => ({
    number: c.number, subject: c.subject_username, status: c.status,
    department: c.department, date: c.date_opened,
    matter: c.subject_matter, files: asArr(c.proof).length + asArr(c.documents).length
  }));
  res.json({ cases });
});

app.get('/api/case/:number', async (req, res) => {
  const { data } = await supabase.from('crd_cases').select('*')
    .eq('number', req.params.number).eq('confidentiality', 'public').eq('classified', false).maybeSingle();
  if (!data) return res.status(404).json({ error: 'Not found or not public' });
  const files = asArr(data.proof).map((f) => fileEntry(f, data.number, 'proof'))
    .concat(asArr(data.documents).map((f) => fileEntry(f, data.number, 'document')));
  res.json({
    case: {
      number: data.number, subject: data.subject_username, status: data.status,
      subjectId: data.subject_id, staffId: data.subject_staff_id, oldPosition: data.subject_old_position,
      department: data.department, date: data.date_opened, matter: data.subject_matter,
      testimony: data.testimony, outcome: data.outcome,
      authorizations: asArr(data.authorizations), files: files
    }
  });
});

app.get('/api/file', async (req, res) => {
  const number = String(req.query.case || '');
  const p = String(req.query.path || '');
  if (!number || !p || p.includes('..')) return res.status(400).send('Bad request');
  const { data } = await supabase.from('crd_cases')
    .select('proof, documents, confidentiality, classified').eq('number', number).maybeSingle();
  if (!data || data.confidentiality !== 'public' || data.classified) return res.status(403).send('Forbidden');
  const allowed = asArr(data.proof).concat(asArr(data.documents)).map((f) => f.path);
  if (allowed.indexOf(p) === -1) return res.status(403).send('Forbidden');
  const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(p, 300, { download: req.query.name || undefined });
  if (!s) return res.status(404).send('File not found');
  res.redirect(s.signedUrl);
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '127.0.0.1', () => console.log('case-public listening on 127.0.0.1:' + PORT));
