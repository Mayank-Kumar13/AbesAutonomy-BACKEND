const fs = require('fs');
const path = require('path');

const targetPath = path.resolve('../../front/AbesAutonomy-FRONT/src/pages/admin/AdminPanel.jsx');

let content = fs.readFileSync(targetPath, 'utf8');

const sr = /<div className="upload-field">\s*<label>Subject \*\s*<\/label>\s*<input\s*type="text"\s*value=\{entry\.subject\}\s*onChange=\{\(e\) => updateFileEntry\(entry\.id, 'subject', e\.target\.value\)\}\s*placeholder="e\.g\. DIGITAL ELECTRONICS"\s*disabled=\{uploading\}\s*\/>\s*<\/div>/;

const rep = `<div className="upload-field">
                        <label>Subject *</label>
                        {subjectsLoading ? (
                          <select disabled value="">
                            <option value="">Loading subjects...</option>
                          </select>
                        ) : subjectsError ? (
                          <div className="admin-error">{subjectsError}</div>
                        ) : subjects.length === 0 ? (
                          <select disabled value="">
                            <option value="">No subjects found</option>
                          </select>
                        ) : (
                          <select
                            value={entry.subject}
                            onChange={(e) => updateFileEntry(entry.id, 'subject', e.target.value)}
                            disabled={uploading}
                          >
                            <option value="" disabled>Select Subject ▼</option>
                            {subjects.map((s) => (
                              <option key={s.subject || s._id || s.name} value={s.subject || s._id || s.name}>
                                {s.subject || s.name || s.title || s._id}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>`;

if(sr.test(content)){
  fs.writeFileSync(targetPath, content.replace(sr, rep));
  console.log('success');
} else {
  console.log('failed: regex did not match');
}
