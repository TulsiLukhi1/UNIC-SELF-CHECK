

class Component extends DCLogic {
  waitBase = (() => { const k = 'unic_waitlist_count'; let n; try { const prev = parseInt(localStorage.getItem(k), 10); n = prev > 0 ? prev + 1 + Math.floor(Math.random() * 3) : 11 + Math.floor(Math.random() * 23); localStorage.setItem(k, String(n)); } catch (e) { n = 11 + Math.floor(Math.random() * 23); } return n; })();
  state = {
    stage: 'pick', name: '', businessName: '', email: '', phone: '', topic: '', bookingSending: false, bookingError: '',
    formOpen: false, view: 'landing', rkey: 'hidden',
    // self-check form
    step: 0, anim: 0, ans: {}, rel: [], offer: '',
    f: { open: '', fname: '', biz: '', wa: '+91 ', em: '', consent: false, website: '' },
    missing: {}, errs: {}, formMsg: '', sending: false, sendError: false, submitted: false, firstName: ''
  };

  /* ===================== SETTINGS ===================== */
  // Paste your Apps Script web app URL here (ends in /exec).
  webAppUrl = 'https://script.google.com/macros/s/AKfycbzH5utFOekZAaxWcHIpDLwIdw5hy5Z3Hmd1JLr1h9wGLVf8_SdZPQgRE1PVKz5JzHmUmw/exec';
  /* ==================================================== */

  buildWeeks() {
    const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); mon.setHours(0,0,0,0);
    const plan = [[1, '10:30 am'], [3, '4:00 pm'], [5, '8:00 am']];
    const ini = ['RS', 'MP', 'AK', 'NJ', 'DV', 'SK', 'PT', 'HM', 'VB'];
    const labels = ['This week', 'Next week', 'In two weeks'];
    const notes = ['Fully booked', 'Fully booked', 'Fully booked'];
    const fmt = d => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    return labels.map((label, w) => ({ label, note: notes[w], slots: plan.map(([off, time], i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + w * 7 + off);
      return { day: fmt(d), time, ini: ini[w * 3 + i] };
    }) }));
  }
  getSavedSelfCheckContact() {
    try {
      const saved = JSON.parse(localStorage.getItem('unic_self_check_contact') || 'null');
      if (!saved || !saved.saved_at || (Date.now() - saved.saved_at) > 30 * 24 * 60 * 60 * 1000) return null;
      return saved;
    } catch (err) {
      console.warn('UNIC: could not read saved Self-Check contact details', err);
      return null;
    }
  }

  bookingVals() {
    const st = this.state, f = k => e => this.setState({ [k]: e.target.value });
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(st.email.trim());
    const phoneDigits = st.phone.replace(/\D/g, '');
    const localPhoneDigits = phoneDigits.length === 12 && phoneDigits.startsWith('91') ? phoneDigits.slice(2) : phoneDigits;
    const phoneOk = /^\d{10}$/.test(localPhoneDigits);
    const cantJoin = !(st.name.trim() && st.businessName.trim() && emailOk && phoneOk);
    return {
      weeks: this.buildWeeks(), waitingCount: this.waitBase + (st.stage === 'done' ? 1 : 0),
      bkIsPick: st.stage === 'pick', bkIsForm: st.stage === 'form', bkIsDone: st.stage === 'done',
      reserve: () => {
        const saved = this.getSavedSelfCheckContact();
        this.setState({
          stage: 'form',
          ...(saved ? {
            name: saved.full_name || '',
            businessName: saved.business_name || '',
            email: saved.email || '',
            phone: saved.phone || ''
          } : {})
        });
      },
      bkBack: () => this.setState({ stage: 'pick' }),
      bkName: st.name, bkBusinessName: st.businessName, bkEmail: st.email, bkPhone: st.phone, bkTopic: st.topic,
      bookingSending: st.bookingSending, bookingError: st.bookingError, bookingButtonLabel: st.bookingSending ? 'Adding you…' : 'Add me to the waitlist',
      bkSetName: f('name'), bkSetBusinessName: f('businessName'), bkSetEmail: f('email'), bkSetPhone: f('phone'), bkSetTopic: f('topic'),
      cantJoin, joinBg: cantJoin ? 'rgba(0,0,0,.12)' : '#000', joinFg: cantJoin ? 'rgba(0,0,0,.45)' : '#B5FFC1',
      join: this.submitFounderSession,
      myNumber: this.waitBase + 1, bkFirstName: st.name.trim().split(' ')[0]
    };
  }


  submitFounderSession = async () => {
    const st = this.state;
    if (st.bookingSending) return;
    const fullName = st.name.trim();
    const businessName = st.businessName.trim();
    const email = st.email.trim();
    const phone = st.phone.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    const localPhoneDigits = phoneDigits.length === 12 && phoneDigits.startsWith('91') ? phoneDigits.slice(2) : phoneDigits;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if (!fullName || !businessName || !emailOk || !/^\d{10}$/.test(localPhoneDigits)) {
      this.setState({ bookingError: 'Please enter your name, business name, a valid email address and a 10-digit phone number.' });
      return;
    }
    this.setState({ bookingSending: true, bookingError: '' });
    try {
      await this.send({
        type: 'founder_session',
        full_name: fullName,
        business_name: businessName,
        email: email,
        phone: phone,
        topic: st.topic.trim()
      });
      this.setState({ bookingSending: false, bookingError: '', stage: 'done' });
    } catch (err) {
      console.warn('UNIC Founder Session: submission failed', err);
      this.setState({ bookingSending: false, bookingError: 'We couldn’t add you to the waitlist just now. Please check your connection and try again, or email colab@unicbiz.com.' });
    }
  };

  rprofiles = {
    hidden: { name: "Hidden Potential", echo: "POTENTIAL", value: "Low", lead: "Building",
      headline: "Your business has Hidden Potential.",
      summary: "The opportunity in your business is large. Clarity will build the confidence to act on it.",
      meansLead: "Founders in this profile often carry a quiet weight.",
      meansRest: "They sense the business can do far more, yet the path forward feels unclear, and every option carries a risk. That hesitation is natural. It usually means you care deeply about what you’ve built and want the next move to be the right one.",
      forwardLead: "Seeing the situation clearly, one piece at a time.",
      forwardRest: "When you can name what’s stuck and why, confidence follows, and the next step becomes smaller and safer than it looks today.",
      snapshot: "Natasha will personally review your answers and send your full report, including the area with the biggest opportunity, within 24 hours.",
      sessionHead: "Find your clearest next step.",
      sessionIntro: "In a confidential 90 minutes with Natasha, we talk through what feels stuck, at your pace. You leave with one clear, practical next step and the confidence to take it." },
    ready: { name: "Ready to Recalibrate", echo: "RECALIBRATE", value: "Low", lead: "High",
      headline: "You’re Ready to Recalibrate.",
      summary: "You see what’s holding the business back, and you’re ready to act on it. The next step is precision.",
      meansLead: "Founders in this profile feel the gap clearly.",
      meansRest: "Growth has slowed, decisions pile up, and effort no longer turns into results the way it once did. You’ve already done the hardest part: you’re honest about it, and you want change. The risk now is spending that energy on the wrong fix.",
      forwardLead: "A clear read of where your core value sits, and a focused plan to release it.",
      forwardRest: "Precision turns your readiness into momentum.",
      snapshot: "Natasha will personally review your answers and send your full report, including the area with the biggest opportunity, within 24 hours.",
      sessionHead: "Turn your readiness into a plan.",
      sessionIntro: "In 90 minutes with Natasha, we take your self-check result and your biggest stuck point, and map the first moves that matter most. You leave knowing exactly where to focus." },
    steady: { name: "Steady Ground", echo: "STEADY", value: "High", lead: "Building",
      headline: "You’re on Steady Ground.",
      summary: "Things are stable. This is the moment to design ahead, calmly.",
      meansLead: "Founders in this profile run a business that holds together well.",
      meansRest: "The pressure to change may feel low, which makes this the ideal time to think ahead. Stable periods give you room to choose the future deliberately, before the market or a key moment chooses it for you.",
      forwardLead: "Space to step back and ask what you want the business to become over the next five years,",
      forwardRest: "and what that means for you as a leader.",
      snapshot: "Natasha will personally review your answers and send your full report, including the area with the most room to grow, within 24 hours.",
      sessionHead: "Think ahead, with a clear head.",
      sessionIntro: "In a relaxed, confidential 90 minutes with Natasha, we look at where the business is heading and what you want from it. You leave with a clear picture of your next chapter and the first steps to shape it." },
    primed: { name: "Primed for the Next Stage", echo: "NEXTSTAGE", value: "High", lead: "High",
      headline: "You’re Primed for the Next Stage.",
      summary: "Your foundations are solid, and you’re ready to design what comes next.",
      meansLead: "Founders in this profile have built something that works.",
      meansRest: "Customers value what you do, and the business runs with real discipline. The question now is ambition: what’s the next level, and what will it take to get there without losing what makes the business strong?",
      forwardLead: "A deliberate design for the next stage of growth,",
      forwardRest: "whether that’s a new market, a new offer, a stronger leadership team or succession. Strong businesses grow fastest when the next step is designed rather than drifted into.",
      snapshot: "Natasha will personally review your answers and send your full report, including the area with the most room to grow, within 24 hours.",
      sessionHead: "Design your next stage.",
      sessionIntro: "In 90 minutes with Natasha, we explore where your next stage of growth can come from, and test your best ideas against your numbers and your team. You leave with a sharper direction and the first moves to get there." }
  };
  gets = [
    { icon: "01", lead: "Clarity", rest: "on the real cause behind the problem you feel most" },
    { icon: "02", lead: "A focused next move", rest: "the one or two actions that will make the biggest difference now" },
    { icon: "03", lead: "A fresh perspective", rest: "from someone outside your business, with no agenda beyond your growth" },
    { icon: "about", lead: "A written summary", rest: "of the session and your next moves, within 48 hours" }
  ];
  rsteps = [
    { n: "1", t: "Join the waitlist.", d: "It’s free. We message you on WhatsApp and email when a session opens." },
    { n: "2", t: "Tell us what’s on your mind.", d: "When you book, share in a few lines the question you most want to work through. Natasha reviews it alongside your self-check result before you meet." },
    { n: "3", t: "Get your confirmation.", d: "When your slot opens, we confirm by email and WhatsApp and send a secure payment link." },
    { n: "4", t: "Meet for 90 minutes.", d: "An honest, structured conversation, at your pace." },
    { n: "5", t: "Act with confidence.", d: "You leave knowing where to focus, and your summary follows." }
  ];
  rorder = ["steady", "primed", "hidden", "ready"];

  /* ===================== Self-check content (answer text matches the Snapshot Library word for word) ===================== */
  LIK = ["Not true", "Somewhat true", "Mostly true", "Completely true"];
  FIELDS = {
    offer: { kind: 'text', text: "What do you sell, and who buys it?" },
    type: { kind: 'grid3', text: "Which best describes your business?", opts: ["Manufacturing", "Trading / distribution", "B2B services", "Consumer products", "Consumer services", "Other"] },
    team: { kind: 'grid3', text: "How many people work in your business operations, including you?", opts: ["Just me", "2–5", "6–20", "21–50", "51–200", "More than 200"] },
    turnover: { kind: 'grid2', text: "What was your business’s turnover last financial year?", opts: ["Under ₹50 lakh", "₹50 lakh–₹2 crore", "₹2–10 crore", "₹10–50 crore", "Above ₹50 crore", "Prefer not to say"] },
    relations: { kind: 'multi', text: "Which relationships does your business depend on most right now?", tag: "Pick up to two", opts: ["Core team", "Key suppliers or vendors", "Distributors or channel partners", "Major customers", "Local community", "Family members in the business"] },
    P1: { kind: 'list', text: "After customers buy from you, how clearly can you say what changed for them?", opts: ["I'm not sure what changes for them", "I believe it helps, but I rarely hear specifics", "Customers often tell me specific results", "I can name recent customers and exactly what changed, in their words"] },
    P2: { kind: 'list', text: "If your business disappeared tomorrow, how would your customers be affected?", opts: ["They'd switch to someone else easily", "Some would miss us; most would find an alternative quickly", "Many would struggle to replace what we provide", "Key customers would be stuck; what we provide is hard to replace"] },
    L1: { kind: 'likert', lead: true, text: "I can describe what I sell in the words my customers actually use." },
    B1: { kind: 'list', text: "How well do you know what it costs — time, money and people — to deliver to one customer, start to finish?", opts: ["I don't really know", "I know the direct costs, like materials", "I know direct costs and roughly the time and people involved", "I know the full cost per customer and review it regularly"] },
    B2: { kind: 'list', text: "If you took two weeks off with no phone, what would happen?", opts: ["Most work would stall", "Routine work continues; anything unusual waits for me", "Most things get delivered; a few decisions wait", "Everything gets delivered on time"] },
    L2: { kind: 'likert', lead: true, text: "I'm genuinely okay with this business running well without me for two weeks." },
    M1: { kind: 'list', text: "If you needed new orders this week, how many real buyers could you call today who would say yes?", opts: ["I'd struggle to name any", "One or two", "Three or four", "Five or more, by name"] },
    M2: { kind: 'list', text: "When you lose a sale, how well do you know the real reason?", opts: ["We rarely find out", "We assume a reason, usually price", "We sometimes ask and hear a reason", "We ask every time and track the reasons"] },
    L3: { kind: 'likert', lead: true, text: "When I lose a sale, I look honestly at why, instead of explaining it away." },
    R1: { kind: 'list', text: "When good people leave your business, how well do you understand why?", opts: ["Good people leave often, and I'm not sure why", "They leave, and I have my own theory", "A few leave, and I ask each one why", "Good people rarely leave, and we regularly check how they're doing"] },
    R2: { kind: 'list', text: "How clearly can you say what your business gives back to the people and places it depends on: team, suppliers, community?", opts: ["I haven't thought about it", "We give back occasionally, without a plan", "We give back regularly to some of them", "We give back deliberately to all of them, and it strengthens the business"] },
    L4: { kind: 'likert', lead: true, text: "When I'm under pressure, I stay steady enough that my team doesn't feel it." }
  };
  SCORED = ['P1', 'P2', 'L1', 'B1', 'B2', 'L2', 'M1', 'M2', 'L3', 'R1', 'R2', 'L4'];
  STEPS = [
    { title: ["Product", "Value"], eyebrow: "What your customers get from you", sub: "How clearly customers feel the difference you make.", fields: ['offer', 'type', 'P1', 'P2', 'L1'] },
    { title: ["Business", "Value"], eyebrow: "How the business runs", sub: "What it takes to deliver, and how much of it depends on you.", fields: ['team', 'B1', 'B2', 'L2'] },
    { title: ["Market", "Value"], eyebrow: "How you win and keep buyers", sub: "Where your next orders come from, and what lost sales are telling you.", fields: ['turnover', 'M1', 'M2', 'L3'] },
    { title: ["Regenerate", "Value"], eyebrow: "What keeps people and partners with you", sub: "The relationships your business depends on, and what keeps them strong.", fields: ['relations', 'R1', 'R2', 'L4'] },
    { title: ["Almost", "done"], eyebrow: "Your details", sub: "See your profile now. Natasha will personally review your answers and send your full report within 24 hours.", contact: true }
  ];
  NUM = (() => { const o = {}; let n = 0; [['offer', 'type', 'P1', 'P2', 'L1'], ['team', 'B1', 'B2', 'L2'], ['turnover', 'M1', 'M2', 'L3'], ['relations', 'R1', 'R2', 'L4']].forEach(a => a.forEach(id => { o[id] = ++n; })); return o; })();
  PROFILE_KEY = { "Ready to Recalibrate": 'ready', "Hidden Potential": 'hidden', "Primed for the Next Stage": 'primed', "Steady Ground": 'steady' };

  /* ===================== Scoring: UNIC Self-Check v1 rules ===================== */
  scoreAll(s) {
    const product = s.P1 + s.P2, business = s.B1 + s.B2, market = s.M1 + s.M2, regenerate = s.R1 + s.R2;
    const value_total = product + business + market + regenerate;
    const readiness = s.L1 + s.L2 + s.L3 + s.L4;
    const profile = value_total <= 12
      ? (readiness >= 9 ? "Ready to Recalibrate" : "Hidden Potential")
      : (readiness >= 9 ? "Primed for the Next Stage" : "Steady Ground");
    return { product, business, market, regenerate, value_total, readiness, profile };
  }

  /* ===================== Form behaviour ===================== */
  bodyRef = React.createRef();
  headRef = React.createRef();
  isAnswered(id) {
    const st = this.state;
    if (id === 'offer') return !!st.offer.trim();
    if (id === 'relations') return st.rel.length > 0;
    return typeof st.ans[id] === 'number';
  }
  missingIn(stepIdx) { return (this.STEPS[stepIdx].fields || []).filter(id => !this.isAnswered(id)); }
  scrollToQ(id) {
    const el = document.getElementById('uf-q-' + id);
    if (el) el.scrollIntoView({ block: 'center', behavior: this.reduced() ? 'auto' : 'smooth' });
  }
  reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  afterStep() {
    setTimeout(() => {
      const b = this.bodyRef.current; if (b) b.scrollTop = 0;
      const h = this.headRef.current; if (h) { try { h.focus({ preventScroll: true }); } catch (_) { h.focus(); } }
    }, 30);
  }
  pick(id, j, multi) {
    const st = this.state;
    const missing = { ...st.missing, [id]: false };
    if (multi) {
      const has = st.rel.includes(j);
      if (!has && st.rel.length >= 2) return;
      const rel = has ? st.rel.filter(x => x !== j) : [...st.rel, j];
      this.setState({ rel, missing, formMsg: '' });
      return;
    }
    this.setState({ ans: { ...st.ans, [id]: j }, missing, formMsg: '' });
    // One-question-at-a-time feel: bring the next unanswered question into view if it is below the fold
    const fields = this.STEPS[st.step].fields || [];
    const nextId = fields.slice(fields.indexOf(id) + 1).find(x => x !== 'offer' && !this.isAnswered(x));
    if (nextId) setTimeout(() => {
      const el = document.getElementById('uf-q-' + nextId), b = this.bodyRef.current;
      if (!el || !b) return;
      const r = el.getBoundingClientRect(), br = b.getBoundingClientRect();
      if (r.top > br.bottom - 140) b.scrollTo({ top: b.scrollTop + (r.top - br.top) - 32, behavior: this.reduced() ? 'auto' : 'smooth' });
    }, 160);
  }
  setField = (name) => (e) => {
    const v = name === 'consent' ? e.target.checked : e.target.value;
    this.setState({ f: { ...this.state.f, [name]: v }, errs: { ...this.state.errs, [name]: '' }, formMsg: '' });
  };
  normalisePhone(v) { return String(v || '').replace(/[\s\-().]/g, ''); }
  validateContact() {
    const f = this.state.f, e = {};
    const wa = this.normalisePhone(f.wa), em = f.em.trim();
    if (!f.fname.trim()) e.fname = 'Please add your full name.';
    if (!f.biz.trim()) e.biz = 'Please add your business name.';
    if (!wa || wa === '+91') e.wa = 'Please add your WhatsApp number.';
    else if (!/^\+\d{8,15}$/.test(wa)) e.wa = 'Please enter the number with its country code, for example +91 98765 43210.';
    if (!em) e.em = 'Please add your email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.em = 'Please check your email address, for example name@company.com.';
    if (!f.consent) e.consent = 'Please tick the box so Natasha can store your answers and send your report.';
    return e;
  }
  next = () => {
    const st = this.state;
    if (st.sending) return;
    if (st.step < 4) {
      const miss = this.missingIn(st.step);
      if (miss.length) {
        const missing = {}; miss.forEach(id => { missing[id] = true; });
        this.setState({ missing, formMsg: miss.length > 1 ? 'Please answer the highlighted questions.' : 'Please answer the highlighted question.' });
        setTimeout(() => this.scrollToQ(miss[0]), 0);
        return;
      }
      this.setState({ step: st.step + 1, anim: (st.anim + 1) % 2, missing: {}, formMsg: '' });
      this.afterStep();
      return;
    }
    this.submit();
  };
  back = () => {
    const st = this.state;
    if (st.step === 0 || st.sending) return;
    this.setState({ step: st.step - 1, anim: (st.anim + 1) % 2, missing: {}, formMsg: '' });
    this.afterStep();
  };
  onFormKey = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'TEXTAREA' || tag === 'A') return;
    // On an answer button, Space selects and Enter moves on; other buttons keep their own Enter
    if (tag === 'BUTTON' && !/\buf-(opt|pill)\b/.test(e.target.className || '')) return;
    e.preventDefault();
    this.next();
  };
  async submit() {
    const st = this.state;
    // Safety net: every section must be complete
    for (let i = 0; i < 4; i++) {
      const miss = this.missingIn(i);
      if (miss.length) {
        const missing = {}; miss.forEach(id => { missing[id] = true; });
        this.setState({ step: i, anim: (st.anim + 1) % 2, missing, formMsg: 'Please answer the highlighted questions.' });
        this.afterStep(); return;
      }
    }
    const errs = this.validateContact();
    if (Object.keys(errs).length) {
      this.setState({ errs, formMsg: 'Please check the highlighted details.' });
      const first = ['fname', 'biz', 'wa', 'em', 'consent'].find(k => errs[k]);
      setTimeout(() => { const el = document.getElementById('uf-' + first); if (el) el.focus(); }, 0);
      return;
    }
    const scores = {}, answers = {};
    this.SCORED.forEach(id => { const v = st.ans[id]; scores[id] = v; answers[id] = { answer: (this.FIELDS[id].opts || this.LIK)[v], score: v }; });
    const r = this.scoreAll(scores);
    const f = st.f, fullName = f.fname.trim();
    const firstName = fullName.split(/\s+/)[0] || '';
    const rkey = this.PROFILE_KEY[r.profile];

    // Honeypot: a filled "website" field means a bot. Discard silently, still show the result.
    if (f.website.trim()) { this.finish(rkey, firstName); return; }

    if (!this.sid) this.sid = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); // kept across retries
    const pick = (id) => this.FIELDS[id].opts[st.ans[id]];
    const payload = {
      submission_id: this.sid,
      submitted_at_client: new Date().toISOString(),
      full_name: fullName,
      business_name: f.biz.trim(),
      whatsapp: this.normalisePhone(f.wa),
      email: f.em.trim(),
      utm_source: this.utm.utm_source, utm_medium: this.utm.utm_medium, utm_campaign: this.utm.utm_campaign,
      answers, scores: r,
      open_answer: f.open.trim(),
      consent: !!f.consent,
      context: { offer: st.offer.trim(), type: pick('type'), team: pick('team'), turnover: pick('turnover'), relations: st.rel.slice().sort((a, b) => a - b).map(j => this.FIELDS.relations.opts[j]) },
      website: f.website
    };
    this.setState({ sending: true, sendError: false, formMsg: '' });
    try {
      await this.send(payload);
      try {
        localStorage.setItem('unic_self_check_contact', JSON.stringify({
          full_name: fullName,
          business_name: f.biz.trim(),
          phone: this.normalisePhone(f.wa),
          email: f.em.trim(),
          saved_at: Date.now()
        }));
      } catch (storageErr) {
        console.warn('UNIC: could not save Self-Check contact details locally', storageErr);
      }
      this.setState({ sending: false });
      this.finish(rkey, firstName);
    } catch (err) {
      console.warn('UNIC Self-Check: submission failed', err);
      this.setState({ sending: false, sendError: true });
    }
  }
  async send(payload) {
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(this.webAppUrl)) throw new Error('webAppUrl is not set yet');
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(this.webAppUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: ctrl.signal, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let data = null; try { data = await res.json(); } catch (_) { /* an unreadable but successful reply counts as sent */ }
      if (data && data.ok === false) throw new Error(data.error || 'rejected');
    } finally { clearTimeout(timer); }
  }
  finish(rkey, firstName) {
    this.close();
    this.setState({ view: 'result', rkey, submitted: true, firstName });
    window.scrollTo(0, 0);
  }

  /* ===================== UTM tracking ===================== */
  utm = { utm_source: '', utm_medium: '', utm_campaign: '' };
  takeUtm(src) {
    if (!src || typeof src !== 'object') return;
    Object.keys(this.utm).forEach(k => { const v = src[k]; if (typeof v === 'string' && v.trim()) this.utm[k] = v.trim().slice(0, 200); });
  }
  // OPTIONAL: inside a Wix HTML embed the page can't read the parent URL, so the parent page sends the UTMs (Velo snippet).
  onMsg = (ev) => { this.takeUtm(ev.data); };

  heroRef = React.createRef();
  h1Ref = React.createRef();
  measure = () => {
    const s = this.heroRef.current, t = this.h1Ref.current;
    if (!s || !t) return;
    const H = Math.round(s.getBoundingClientRect().bottom - t.getBoundingClientRect().top);
    const sr = s.getBoundingClientRect(), tr = t.getBoundingClientRect();
    const W = Math.max(56, Math.min(200, Math.floor((sr.right - tr.right - 48 - 42) / 4)));
    const show = window.innerWidth >= 1000;
    if (H !== this.state.planeH || W !== this.state.planeW || show !== this.state.showPlanes) this.setState({ planeH: H, planeW: W, showPlanes: show });
  };
  componentDidMount() {
    try {
      const q = new URLSearchParams(window.location.search);
      this.takeUtm({
        utm_source: q.get('utm_source') || '',
        utm_medium: q.get('utm_medium') || '',
        utm_campaign: q.get('utm_campaign') || ''
      });

      // Open the existing Founder Session waitlist form directly from email links.
      if (q.get('waitlist') === '1') {
        const saved = this.getSavedSelfCheckContact();
        this.setState({
          view: 'result',
          stage: 'form',
          ...(saved ? {
            name: saved.full_name || '',
            businessName: saved.business_name || '',
            email: saved.email || '',
            phone: saved.phone || ''
          } : {})
        });

        // In direct-waitlist mode, show only the existing booking/waitlist section.
        document.body.classList.add('unic-waitlist-direct');
        let directStyle = document.getElementById('unic-waitlist-direct-style');
        if (!directStyle) {
          directStyle = document.createElement('style');
          directStyle.id = 'unic-waitlist-direct-style';
          directStyle.textContent = `
            body.unic-waitlist-direct [data-screen-label]:not(#book) {
              display: none !important;
            }
            body.unic-waitlist-direct #book {
              display: flex !important;
            }
          `;
          document.head.appendChild(directStyle);
        }

        // Wait for the result view to render before positioning the form.
        setTimeout(() => {
          const bookingSection = document.getElementById('book');
          if (bookingSection) {
            bookingSection.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
        }, 250);
      }
    } catch (err) {
      console.warn('UNIC direct waitlist navigation:', err);
    }
    window.addEventListener('message', this.onMsg);
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'unic-selfcheck-ready' }, '*'); } catch (_) {}
    window.addEventListener('resize', this.measure);
    this.measure(); [200, 800, 2000].forEach(t => setTimeout(this.measure, t));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(this.measure);
  }
  componentDidUpdate() { this.measure(); }
  onKey = (e) => { if (e.key === 'Escape') this.close(); };
  open = () => {
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', this.onKey);
    // A founder who already submitted starts a fresh check
    if (this.state.submitted) {
      this.sid = null;
      this.setState({ formOpen: true, submitted: false, step: 0, ans: {}, rel: [], offer: '', f: { open: '', fname: '', biz: '', wa: '+91 ', em: '', consent: false, website: '' }, missing: {}, errs: {}, formMsg: '', sendError: false });
    } else this.setState({ formOpen: true });
    this.afterStep();
  };
  close = () => { document.body.style.overflow = ''; window.removeEventListener('keydown', this.onKey); this.setState({ formOpen: false }); };
  componentWillUnmount() { this.close(); window.removeEventListener('message', this.onMsg); window.removeEventListener('resize', this.measure); }

  formVals() {
    const st = this.state, S = this.STEPS[st.step];
    const pad = n => String(n).padStart(2, '0');
    const qs = (S.fields || []).map(id => {
      const d = this.FIELDS[id], missing = !!st.missing[id];
      const base = {
        id, n: pad(this.NUM[id]), text: d.text, labelId: 'uf-l-' + id, domId: 'uf-q-' + id,
        tag: d.lead ? 'About you as a leader' : (d.tag || ''), hasTag: !!(d.lead || d.tag),
        missing, missingText: d.kind === 'text' ? 'Please tell us what you sell.' : 'Please choose an answer.',
        cls: 'uf-q' + (missing ? ' missing' : ''),
        isText: d.kind === 'text', isLikert: d.kind === 'likert', isChoice: ['list', 'grid2', 'grid3', 'multi'].indexOf(d.kind) >= 0
      };
      if (d.kind === 'text') return { ...base, value: st.offer, onChange: (e) => this.setState({ offer: e.target.value, missing: { ...this.state.missing, offer: false }, formMsg: '' }) };
      const multi = d.kind === 'multi';
      const opts = (d.opts || this.LIK).map((t, j) => {
        const checked = multi ? st.rel.indexOf(j) >= 0 : st.ans[id] === j;
        return { key: 'ABCDEF'[j], text: t, checked, role: multi ? 'checkbox' : 'radio', disabled: multi && !checked && st.rel.length >= 2, pick: () => this.pick(id, j, multi) };
      });
      return { ...base, opts, groupRole: multi ? 'group' : 'radiogroup', optsCls: d.kind === 'list' ? 'uf-opts' : d.kind === 'grid3' ? 'uf-grid3' : 'uf-grid2' };
    });
    const errs = st.errs;
    const inv = { fname: !!errs.fname, biz: !!errs.biz, wa: !!errs.wa, em: !!errs.em, consent: !!errs.consent };
    return {
      stepCount: (st.step + 1) + ' of 5',
      progress: ((st.step + 1) / 5 * 100) + '%',
      animKey: st.anim,
      stepNum: pad(st.step + 1),
      stepEyebrow: S.eyebrow, stepTitleA: S.title[0], stepTitleB: S.title[1], stepSub: S.sub,
      isQuestions: !S.contact, isContact: !!S.contact,
      qs, f: st.f, errs, inv,
      onOpen: this.setField('open'), onFname: this.setField('fname'), onBiz: this.setField('biz'), onWa: this.setField('wa'), onEm: this.setField('em'), onConsent: this.setField('consent'), onWebsite: this.setField('website'),
      sendError: st.sendError, sending: st.sending, formMsg: st.formMsg,
      canBack: st.step > 0, showEnter: !S.contact,
      nextLabel: st.sending ? 'Sending…' : S.contact ? (st.sendError ? 'Try again' : 'See my profile →') : 'Next →',
      next: this.next, back: this.back, onFormKey: this.onFormKey, bodyRef: this.bodyRef, headRef: this.headRef
    };
  }

  renderVals() {
    const prof = this.rprofiles[this.state.rkey];
    const p = this.state.firstName ? { ...prof, snapshot: 'Thank you, ' + this.state.firstName + '. ' + prof.snapshot } : prof;
    return {
      ...this.bookingVals(),
      ...this.formVals(),
      formOpen: this.state.formOpen,
      openForm: this.open,
      heroRef: this.heroRef,
      h1Ref: this.h1Ref,
      showPlanes: !!this.state.showPlanes,
      planeA: this.state.planeH || 300,
      planeB: Math.round((this.state.planeH || 300) * 0.7),
      planeC: Math.round((this.state.planeH || 300) * 0.78),
      planeD: Math.round((this.state.planeH || 300) * 0.9),
      planeW: this.state.planeW || 84,
      isLanding: this.state.view === 'landing',
      isResult: this.state.view === 'result',
      p,
      gets: this.gets,
      rsteps: this.rsteps,
      cells: this.rorder.map(k => ({ name: this.rprofiles[k].name, active: k === this.state.rkey, inactive: k !== this.state.rkey })),
      toBook: () => { const el = document.getElementById('book'); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' }); },
      toHome: (e) => {
        if (e) e.preventDefault();
        document.body.classList.remove('unic-waitlist-direct');
        const directStyle = document.getElementById('unic-waitlist-direct-style');
        if (directStyle) directStyle.remove();
        this.setState({ view: 'landing' });
        window.scrollTo(0, 0);
      },
      closeForm: this.close,
      stop: (e) => e.stopPropagation(),
      quotes: ["My team waits for me to decide everything.", "Good people join, and then they leave.", "Revenue is flat, and I’m working harder than ever.", "I know we can do more. I can’t see the next move clearly."],
      profiles: [
        { name: "Ready to Recalibrate", value: "Low", lead: "High", meaning: "You see the problem and you’re ready to move. The next step is precision." },
        { name: "Hidden Potential", value: "Low", lead: "Building", meaning: "The opportunity is large. Clarity will build the confidence to act." },
        { name: "Primed for the Next Stage", value: "High", lead: "High", meaning: "Your foundations are solid, and you’re ready to design the next stage of growth." },
        { name: "Steady Ground", value: "High", lead: "Building", meaning: "Things are stable. This is the moment to design ahead, calmly." }
      ],
      steps: [
        { n: "01", title: "Answer 17 questions", body: "About your business and your leadership. It takes about 7 minutes." },
        { n: "02", title: "Receive your snapshot", body: "On WhatsApp and email: your profile, what it means, and your first move." },
        { n: "03", title: "Decide what’s next", body: "Use the insight on your own, or talk it through with Natasha." }
      ],
      creds: ["IDEO U", "Harvard Kennedy School (Policy Design)", "Strategic Leadership, LBSNAA", "Board of Studies, MIT Institute of Design, Pune"],
      faqs: [
        { q: "Is it really free?", a: "Yes. The self-check and your snapshot are free." },
        { q: "Will I get sales calls?", a: "You’ll receive your snapshot and occasional founder insights on WhatsApp or email. You choose if and when to talk." },
        { q: "Who sees my answers?", a: "Only Natasha and the UNIC team, to prepare your snapshot." }
      ]
    };
  }
}

