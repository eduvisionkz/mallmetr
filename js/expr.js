// Қауіпсіз формула талдағышы (eval қолданылмайды)
// Қолдау: + - * / ^, жақшалар, сандар, айнымалылар, функциялар: sqrt cbrt exp ln log10 abs pow min max, тұрақты pi

export const VARIABLES = ['H', 'L', 'D'];
const FUNCS = {
  sqrt: [1, Math.sqrt], cbrt: [1, Math.cbrt], exp: [1, Math.exp], ln: [1, Math.log],
  log10: [1, Math.log10], abs: [1, Math.abs], pow: [2, Math.pow], min: [2, Math.min], max: [2, Math.max],
};
const CONSTS = { pi: Math.PI };

function tokenize(src) {
  const s = src.replace(/[·×∙]/g, '*').replace(/π/g, 'pi').replace(/−/g, '-').replace(/÷/g, '/');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      // Формулада ондық бөлгіш — нүкте; үтір мен нүктелі үтір функция аргументтерін бөледі
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      let raw = s.slice(i, j);
      if (e10(s, j)) { // 1e-3 сияқты жазу
        let k = j + 1; if (s[k] === '+' || s[k] === '-') k++;
        while (k < s.length && /[0-9]/.test(s[k])) k++;
        raw += s.slice(j, k); j = k;
      }
      const v = Number(raw);
      if (!Number.isFinite(v) || raw === '.') throw new Error('Сан қате жазылған: ' + raw);
      out.push({ t: 'num', v }); i = j; continue;
    }
    if (/[A-Za-z_Ѐ-ӿ]/.test(c)) {
      let j = i; while (j < s.length && /[A-Za-z0-9_Ѐ-ӿ]/.test(s[j])) j++;
      out.push({ t: 'id', v: s.slice(i, j) }); i = j; continue;
    }
    if (c === ';') { out.push({ t: 'op', v: ',' }); i++; continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('Белгісіз таңба: ' + c);
  }
  return out;
}
function e10(s, j) { return (s[j] === 'e' || s[j] === 'E') && /[0-9+-]/.test(s[j + 1] || '') && !/[A-Za-z]/.test(s[j + 2] || '0'); }

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = v => peek() && peek().t === 'op' && peek().v === v;
  const expect = v => { if (!isOp(v)) throw new Error(`"${v}" күтілді`); p++; };

  function expr() {
    let n = term();
    while (isOp('+') || isOp('-')) { const op = toks[p++].v; n = { t: 'bin', op, a: n, b: term() }; }
    return n;
  }
  function term() {
    let n = unary();
    while (isOp('*') || isOp('/')) { const op = toks[p++].v; n = { t: 'bin', op, a: n, b: unary() }; }
    return n;
  }
  function unary() {
    if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp('^')) { p++; return { t: 'bin', op: '^', a: base, b: unary() }; }
    return base;
  }
  function atom() {
    const tk = peek();
    if (!tk) throw new Error('Формула толық емес');
    if (tk.t === 'num') { p++; return { t: 'num', v: tk.v }; }
    if (tk.t === 'id') {
      p++;
      if (isOp('(')) {
        const f = FUNCS[tk.v];
        if (!f) throw new Error('Белгісіз функция: ' + tk.v);
        p++;
        const args = [expr()];
        while (isOp(',')) { p++; args.push(expr()); }
        expect(')');
        if (args.length !== f[0]) throw new Error(`${tk.v} функциясына ${f[0]} аргумент керек`);
        return { t: 'call', f: tk.v, args };
      }
      if (tk.v in CONSTS) return { t: 'const', v: tk.v };
      return { t: 'var', v: tk.v };
    }
    if (tk.t === 'op' && tk.v === '(') { p++; const n = expr(); expect(')'); return { t: 'par', a: n }; }
    throw new Error('Күтпеген белгі: ' + tk.v);
  }
  const root = expr();
  if (p < toks.length) throw new Error('Артық белгі: ' + toks[p].v);
  return root;
}

export function identifiers(ast, set = new Set()) {
  if (!ast) return set;
  if (ast.t === 'var') set.add(ast.v);
  if (ast.a) identifiers(ast.a, set);
  if (ast.b) identifiers(ast.b, set);
  if (ast.args) ast.args.forEach(x => identifiers(x, set));
  return set;
}

export function coefficientNames(ast) {
  return [...identifiers(ast)].filter(v => !VARIABLES.includes(v));
}

export function evaluate(ast, env) {
  switch (ast.t) {
    case 'num': return ast.v;
    case 'const': return CONSTS[ast.v];
    case 'var':
      if (!(ast.v in env) || env[ast.v] == null || Number.isNaN(env[ast.v])) throw new Error('Мәні жоқ: ' + ast.v);
      return Number(env[ast.v]);
    case 'par': return evaluate(ast.a, env);
    case 'neg': return -evaluate(ast.a, env);
    case 'call': return FUNCS[ast.f][1](...ast.args.map(a => evaluate(a, env)));
    case 'bin': {
      const a = evaluate(ast.a, env), b = evaluate(ast.b, env);
      switch (ast.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': if (b === 0) throw new Error('Нөлге бөлу'); return a / b;
        case '^': return Math.pow(a, b);
      }
    }
  }
  throw new Error('Белгісіз түйін');
}

const OPS = { '*': '·', '/': ' / ', '+': ' + ', '-': ' − ', '^': '^' };

export function fmt(x, digits = 4) {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  let s;
  if (a >= 1e6 || a < 1e-4) s = x.toExponential(Math.max(1, digits - 1)).replace('e', '·10^');
  else s = String(+x.toPrecision(digits));
  return s.replace('.', ',').replace(/-/g, '−');
}

// Формуланы мәтінге айналдыру; subst берілсе — айнымалылар мәндерімен ауыстырылады
export function render(ast, subst = null) {
  const r = n => render(n, subst);
  switch (ast.t) {
    case 'num': return fmt(ast.v, 8);
    case 'const': return subst ? fmt(Math.PI, 6) : 'π';
    case 'var': return subst && ast.v in subst ? wrapNeg(fmt(subst[ast.v], 6)) : ast.v;
    case 'par': return '(' + r(ast.a) + ')';
    case 'neg': return '−' + r(ast.a);
    case 'call': return (ast.f === 'sqrt' ? '√' : ast.f) + '(' + ast.args.map(r).join('; ') + ')';
    case 'bin': return r(ast.a) + OPS[ast.op] + r(ast.b);
  }
}
function wrapNeg(s) { return s.startsWith('−') ? '(' + s + ')' : s; }

// Аралық есептеулер: әр амал үшін «ішкі өрнек = мәні»
export function steps(ast, env) {
  const list = [];
  (function walk(n) {
    if (n.a) walk(n.a);
    if (n.b) walk(n.b);
    if (n.args) n.args.forEach(walk);
    if (n.t === 'bin' || n.t === 'call') {
      list.push({ expr: render(n, env), value: evaluate(n, env) });
    }
  })(ast);
  return list;
}
