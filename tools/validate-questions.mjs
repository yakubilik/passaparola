#!/usr/bin/env node
// Checks the Harfiyen question files (app/assets/questions/*.json) against the
// rules in docs/questions.md and prints every problem it finds.
//
//     node tools/validate-questions.mjs              # the five category files
//     node tools/validate-questions.mjs a.json dir/  # given files or folders
//
// Exit code 0 when everything is clean, 1 when there is at least one problem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const QUESTIONS_DIR = path.join(ROOT, 'app', 'assets', 'questions');

// The ring: the Turkish alphabet without Ğ.
export const LETTERS = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H', 'I', 'İ', 'J', 'K', 'L',
  'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];
export const CATEGORIES = ['tarih', 'cografya', 'bilim', 'sanat', 'spor'];
export const TYPES = ['starts', 'contains'];
export const MIN_PER_LETTER = 4;
export const MAX_CLUE = 140;

const FOLD = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };

// Turkish lower case (I -> ı, İ -> i), circumflex dropped, punctuation to spaces.
export function lower(s) {
  return String(s).normalize('NFC').toLocaleLowerCase('tr-TR')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[.,!?;:'"’‘`´()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Loose form for spotting the same word written two ways (Kudüs / Kudus).
function fold(s) {
  return lower(s).replace(/[çğıöşü]/g, c => FOLD[c]);
}

export function fitsLetter(answer, letter, type) {
  const a = lower(answer);
  const l = lower(letter);
  return type === 'contains' ? a.includes(l) : a.startsWith(l);
}

// True when the clue gives the answer away: the answer's words appear in the
// clue, the last one possibly with a suffix ("Ankara'nın", "Osmanlılar").
// Answers shorter than 4 letters only count as a whole word ("Su" vs "sultan").
export function clueGivesAway(clue, answer) {
  const cw = fold(clue).split(' ').filter(Boolean);
  const aw = fold(answer).split(' ').filter(Boolean);
  if (!aw.length) return false;
  const last = aw[aw.length - 1];
  for (let i = 0; i + aw.length <= cw.length; i++) {
    let hit = true;
    for (let k = 0; k < aw.length - 1; k++) if (cw[i + k] !== aw[k]) { hit = false; break; }
    if (!hit) continue;
    const w = cw[i + aw.length - 1];
    if (w === last || (last.length >= 4 && w.startsWith(last))) return true;
  }
  return false;
}

const isText = v => typeof v === 'string' && v.trim().length > 0;

// Validates one parsed file. `seenIds` is shared between files so an id can
// not repeat anywhere. Returns a list of problem strings.
export function validateData(data, file, seenIds = new Map()) {
  const problems = [];
  const say = (where, msg) => problems.push(`${file}: ${where ? where + ': ' : ''}${msg}`);
  const name = path.basename(file, '.json');

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    say('', 'top level must be an object {"category", "title", "levels"}');
    return problems;
  }
  if (data.category !== name) say('', `"category" is ${JSON.stringify(data.category)}, expected "${name}" (the file name)`);
  if (!isText(data.title)) say('', '"title" must be a non-empty string');
  if (!Array.isArray(data.levels)) {
    say('', '"levels" must be an array');
    return problems;
  }

  const category = data.category;
  const answerOwner = new Map(); // folded answer -> id of the question that has it
  const levelsSeen = new Set();

  data.levels.forEach((lv, li) => {
    const lwhere = `levels[${li}]`;
    if (!lv || typeof lv !== 'object' || !Number.isInteger(lv.level) || lv.level < 1) {
      say(lwhere, '"level" must be a positive whole number');
      return;
    }
    const L = `level ${lv.level}`;
    if (levelsSeen.has(lv.level)) say(L, 'level appears twice');
    levelsSeen.add(lv.level);
    if (!Array.isArray(lv.questions)) { say(L, '"questions" must be an array'); return; }

    const perLetter = new Map(LETTERS.map(l => [l, 0]));

    lv.questions.forEach((q, qi) => {
      const where = q && isText(q.id) ? q.id : `${L} questions[${qi}]`;
      if (!q || typeof q !== 'object') { say(where, 'question must be an object'); return; }

      const letterOk = LETTERS.includes(q.letter);
      if (!letterOk) say(where, `"letter" ${JSON.stringify(q.letter)} is not one of the 28 ring letters`);
      else perLetter.set(q.letter, perLetter.get(q.letter) + 1);

      if (!TYPES.includes(q.type)) say(where, `"type" must be "starts" or "contains", got ${JSON.stringify(q.type)}`);

      if (!isText(q.id)) say(where, '"id" is missing');
      else {
        const m = /^(.+)-(\d+)-(.+)-([1-9]\d*)$/u.exec(q.id);
        const want = `${category}-${lv.level}-${q.letter}-<n>`;
        if (!m || m[1] !== category || Number(m[2]) !== lv.level || m[3] !== q.letter) {
          say(where, `id must look like "${want}"`);
        }
        if (seenIds.has(q.id)) {
          const other = seenIds.get(q.id);
          say(where, other === file ? 'id repeats' : `id repeats (also in ${other})`);
        }
        else seenIds.set(q.id, file);
      }

      if (!isText(q.clue)) say(where, '"clue" must be a non-empty string');
      else {
        const len = [...q.clue].length;
        if (len > MAX_CLUE) say(where, `clue is ${len} characters, the limit is ${MAX_CLUE}`);
      }

      if (!Array.isArray(q.answers) || q.answers.length === 0 || !q.answers.every(isText)) {
        say(where, '"answers" must be a non-empty list of strings');
        return;
      }

      const mine = new Set();
      for (const a of q.answers) {
        if (letterOk && TYPES.includes(q.type) && !fitsLetter(a, q.letter, q.type)) {
          const how = q.type === 'contains' ? 'does not contain' : 'does not start with';
          say(where, `answer "${a}" ${how} ${q.letter}`);
        }
        if (isText(q.clue) && clueGivesAway(q.clue, a)) say(where, `clue contains its own answer "${a}"`);

        const key = fold(a).replace(/ /g, '');
        if (mine.has(key)) continue; // two spellings of one answer in the same question
        mine.add(key);
        const owner = answerOwner.get(key);
        if (owner) say(where, `answer "${a}" is already used in this category by ${owner}`);
        else answerOwner.set(key, isText(q.id) ? q.id : where);
      }
    });

    for (const [letter, n] of perLetter) {
      if (n < MIN_PER_LETTER) say(L, `letter ${letter} has ${n} question${n === 1 ? '' : 's'}, needs at least ${MIN_PER_LETTER}`);
    }
  });

  return problems;
}

export function validateFiles(files) {
  const problems = [];
  const seenIds = new Map();
  let questions = 0;
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      problems.push(`${file}: cannot read as JSON (${e.message})`);
      continue;
    }
    problems.push(...validateData(data, file, seenIds));
    if (data && Array.isArray(data.levels)) {
      for (const lv of data.levels) if (lv && Array.isArray(lv.questions)) questions += lv.questions.length;
    }
  }
  return { problems, questions };
}

function collect(args) {
  const files = [];
  for (const a of args) {
    if (fs.statSync(a, { throwIfNoEntry: false })?.isDirectory()) {
      for (const f of fs.readdirSync(a).filter(f => f.endsWith('.json')).sort()) files.push(path.join(a, f));
    } else files.push(a);
  }
  return files;
}

function main(argv) {
  const problems = [];
  let files;
  if (argv.length) files = collect(argv);
  else {
    files = CATEGORIES.map(c => path.join(QUESTIONS_DIR, `${c}.json`));
    for (const f of files) if (!fs.existsSync(f)) problems.push(`${path.relative(ROOT, f)}: file is missing`);
    files = files.filter(f => fs.existsSync(f));
  }
  const shown = files.map(f => path.relative(process.cwd(), f) || f);
  const res = validateFiles(files);
  res.problems = res.problems.map(p => {
    const i = files.findIndex(f => p.startsWith(f + ':'));
    return i >= 0 ? shown[i] + p.slice(files[i].length) : p;
  });
  problems.push(...res.problems);

  if (problems.length) {
    console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'} found:`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`OK: ${files.length} file${files.length === 1 ? '' : 's'}, ${res.questions} questions`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
