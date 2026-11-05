// Outgoing email. Every message is bilingual (Kiswahili first, then English) because we do not
// know the reader's language. Sending never blocks or fails a request: errors are logged.
const nodemailer = require('nodemailer');
const { query } = require('./db');

const APP_URL = (process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://www.msaadatutani.com' : 'http://localhost:' + (process.env.PORT || 8080))).replace(/\/$/, '');
const FROM = process.env.MAIL_FROM || 'Msaada Tutani <no-reply@msaadatutani.co.tz>';

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    })
  : null;
if (!transport) console.warn('[mail] SMTP_HOST not set; emails will be printed to the console.');

const tzs = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Lays out one message. sw / en: { title, lines: [...] }, plus an optional button.
function layout({ sw, en, link, linkLabel }) {
  const block = (b) => `<h2 style="font:700 21px Arial,Helvetica,sans-serif;margin:0 0 12px">${esc(b.title)}</h2>`
    + b.lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join('');
  const btn = link ? `<p style="margin:20px 0"><a href="${esc(link)}" style="background:#FFC53D;color:#0A0F1C;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">${esc(linkLabel)}</a></p>` : '';
  const html = `<div style="background:#F5F3EE;padding:24px;font-family:Arial,sans-serif;color:#121417">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E3DFD6;border-radius:14px;padding:28px">
      <div style="font:700 19px Arial,Helvetica,sans-serif;margin-bottom:20px">Msaada <span style="color:#B7791F">Tutani</span></div>
      ${block(sw)}${btn}<hr style="border:0;border-top:1px solid #E3DFD6;margin:22px 0">${block(en)}${btn}
      <p style="color:#6D7178;font-size:12px;margin-top:24px">Msaada Tutani · Sadaka yenye kuishi / The living charity.</p>
    </div></div>`;
  const text = [sw.title, ...sw.lines, link || '', '', '---', '', en.title, ...en.lines, link || ''].join('\n');
  return { html, text };
}

async function send(to, subject, body) {
  if (!to) return;
  const msg = { from: FROM, to, subject, ...layout(body) };
  try {
    if (transport) await transport.sendMail(msg);
    else console.log(`[mail] to=${to} subject="${subject}"\n${msg.text}\n`);
  } catch (e) {
    console.error('[mail] failed to', to, '-', e.message);
  }
}
// Fire-and-forget wrapper so a slow mail server never delays a response.
const later = (fn) => setImmediate(() => fn().catch((e) => console.error('[mail]', e.message)));

const CAT = {
  maternity: ['Uzazi', 'Maternity'], surgery: ['Upasuaji', 'Surgery'], inpatient: ['Kulazwa', 'Inpatient stay'],
  child_care: ['Huduma ya watoto', 'Child care'], emergency: ['Dharura', 'Emergency'], dialysis: ['Usafishaji figo', 'Dialysis'],
  cancer_care: ['Matibabu ya saratani', 'Cancer care'], other_health: ['Matibabu mengine', 'Other treatment'],
  school_fees: ['Ada ya shule', 'School fees'], exam_fees: ['Ada ya mtihani', 'Exam fees'], boarding: ['Ada ya bweni', 'Boarding'],
  uniform_books: ['Sare na vitabu', 'Uniform & books'], certificate_release: ['Kutoa cheti', 'Certificate release'],
  other_school: ['Mengineyo', 'Other']
};
const cat = (c, i) => (CAT[c] || [c, c])[i];
const CH = { mpesa: 'M-Pesa', mixx: 'Mixx by Yas', airtel: 'Airtel Money', halopesa: 'HaloPesa', azampesa: 'AzamPesa', bank: 'Bank' };
const ch = (c) => CH[c] || c;

// Where to write to the giver: their account email, else the email they left, else nobody.
async function contributionContext(contributionId) {
  const { rows } = await query(
    `select c.id, c.amount_tzs, c.payment_ref, c.channel, c.status, c.tracking_code,
            coalesce(u.email, c.notify_email) as giver_email,
            b.id as bill_id, b.control_number, b.category, b.amount_tzs as bill_amount, b.confirmed_tzs, b.status as bill_status,
            i.name as inst_name, iu.email as inst_email
     from contributions c join bills b on b.id = c.bill_id join institutions i on i.id = b.institution_id
     join users iu on iu.id = i.user_id left join users u on u.id = c.donor_id
     where c.id = $1`, [contributionId]);
  return rows[0];
}

// A giver reported a payment: ask the institution to confirm it; acknowledge the giver.
function paymentReported(contributionId) {
  later(async () => {
    const c = await contributionContext(contributionId);
    if (!c) return;
    await send(c.inst_email, `Thibitisha malipo / Confirm a payment: ${tzs(c.amount_tzs)}`, {
      sw: { title: 'Malipo mapya ya kuthibitisha', lines: [
        `Mchangiaji ameripoti ${tzs(c.amount_tzs)} kwenye namba ya malipo ${c.control_number} (${cat(c.category, 0)}).`,
        `Namba ya muamala: ${c.payment_ref} (${ch(c.channel)}).`,
        'Linganisha na kumbukumbu zako za GePG au benki, kisha thibitisha au kataa.'] },
      en: { title: 'New payment to confirm', lines: [
        `A giver reported ${tzs(c.amount_tzs)} against control number ${c.control_number} (${cat(c.category, 1)}).`,
        `Receipt reference: ${c.payment_ref} (${ch(c.channel)}).`,
        'Match it against your GePG or bank records, then confirm or reject.'] },
      link: APP_URL + '/#/inst/confirm', linkLabel: 'Thibitisha / Confirm'
    });
    await send(c.giver_email, `Tumepokea taarifa yako / We've logged your payment, ${c.tracking_code}`, {
      sw: { title: 'Asante. Tumepokea taarifa ya malipo yako.', lines: [
        `${tzs(c.amount_tzs)} kwa ${c.inst_name} (${cat(c.category, 0)}).`,
        `Namba ya kufuatilia: ${c.tracking_code}. Tutakutumia barua pepe taasisi ikithibitisha.`] },
      en: { title: 'Thank you. Your payment has been logged.', lines: [
        `${tzs(c.amount_tzs)} to ${c.inst_name} (${cat(c.category, 1)}).`,
        `Tracking code: ${c.tracking_code}. We'll email you when the institution confirms it.`] },
      link: APP_URL + '/#/track/' + c.tracking_code, linkLabel: 'Fuatilia / Track'
    });
  });
}

// The institution confirmed or rejected a payment. If that cleared the bill, tell every giver on it.
function paymentReviewed(contributionId, billJustCleared) {
  later(async () => {
    const c = await contributionContext(contributionId);
    if (!c) return;
    if (c.status === 'confirmed') {
      await send(c.giver_email, `Imethibitishwa / Confirmed: ${tzs(c.amount_tzs)}`, {
        sw: { title: 'Malipo yako yamethibitishwa', lines: [
          `${c.inst_name} imethibitisha ${tzs(c.amount_tzs)} kwenye kumbukumbu zake. Asante kwa kusaidia.`] },
        en: { title: 'Your payment is confirmed', lines: [
          `${c.inst_name} confirmed ${tzs(c.amount_tzs)} in its records. Thank you for helping.`] },
        link: APP_URL + '/#/track/' + c.tracking_code, linkLabel: 'Angalia / View'
      });
    } else if (c.status === 'rejected') {
      await send(c.giver_email, `Malipo hayakupatikana / Payment not matched, ${c.tracking_code}`, {
        sw: { title: 'Taasisi haikupata malipo haya', lines: [
          `${c.inst_name} haikupata ${tzs(c.amount_tzs)} yenye namba ya muamala ${c.payment_ref} kwenye kumbukumbu zake.`,
          'Hakiki namba ya muamala kwenye SMS yako, au wasiliana na mtoa huduma wako wa malipo.'] },
        en: { title: 'The institution could not find this payment', lines: [
          `${c.inst_name} could not find ${tzs(c.amount_tzs)} with reference ${c.payment_ref} in its records.`,
          'Check the reference in your SMS receipt, or contact your payment provider.'] },
        link: APP_URL + '/#/track/' + c.tracking_code, linkLabel: 'Angalia / View'
      });
    }
    if (billJustCleared) {
      const { rows } = await query(
        `select distinct coalesce(u.email, c.notify_email) as email from contributions c
         left join users u on u.id = c.donor_id
         where c.bill_id = $1 and c.status = 'confirmed' and coalesce(u.email, c.notify_email) is not null`, [c.bill_id]);
      for (const r of rows) {
        await send(r.email, `Bili imelipwa yote / A bill you helped is cleared`, {
          sw: { title: 'Bili uliyosaidia imelipwa yote', lines: [
            `Bili ya ${cat(c.category, 0)} ya ${tzs(c.bill_amount)} kwa ${c.inst_name} sasa imelipwa yote. Mchango wako ulisaidia.`] },
          en: { title: 'A bill you helped is fully cleared', lines: [
            `The ${tzs(c.bill_amount)} ${cat(c.category, 1).toLowerCase()} bill at ${c.inst_name} is now fully paid. You helped make that happen.`] },
          link: APP_URL + '/#/bills', linkLabel: 'Saidia nyingine / Help another'
        });
      }
    }
  });
}

function institutionRegistered(institutionId) {
  later(async () => {
    const { rows } = await query(
      `select i.name, i.reg_no, i.region, u.email from institutions i join users u on u.id = i.user_id where i.id = $1`, [institutionId]);
    const i = rows[0];
    if (!i) return;
    await send(i.email, 'Tumepokea usajili wako / Registration received', {
      sw: { title: 'Tumepokea usajili wako', lines: [
        `Tunakagua ${i.name} (namba ya usajili ${i.reg_no}). Kwa kawaida huchukua siku 1 hadi 2 za kazi.`,
        'Tutakutumia barua pepe ukithibitishwa. Malipo yatakayoripotiwa yatatumwa kwenye anwani hii pia.'] },
      en: { title: 'We have your registration', lines: [
        `We're checking ${i.name} (registration no. ${i.reg_no}). This usually takes 1 to 2 working days.`,
        "We'll email you once you're verified. Payments to confirm will be sent to this address too."] }
    });
    const admins = await query(`select email from users where role = 'admin'`);
    for (const a of admins.rows) {
      await send(a.email, `New institution to verify: ${i.name}`, {
        sw: { title: 'Taasisi mpya inasubiri uthibitisho', lines: [`${i.name} · ${i.reg_no} · ${i.region}`] },
        en: { title: 'New institution awaiting verification', lines: [`${i.name} · ${i.reg_no} · ${i.region}`] },
        link: APP_URL + '/#/admin', linkLabel: 'Kagua / Review'
      });
    }
  });
}

function institutionReviewed(institutionId) {
  later(async () => {
    const { rows } = await query(
      `select i.name, i.status, i.review_note, u.email from institutions i join users u on u.id = i.user_id where i.id = $1`, [institutionId]);
    const i = rows[0];
    if (!i) return;
    const note = i.review_note ? [i.review_note] : [];
    const msgs = {
      verified: ['Umethibitishwa / You are verified', 'Taasisi yako imethibitishwa', [`${i.name} sasa inaweza kuweka bili.`],
        'Your institution is verified', [`${i.name} can now post bills.`], 'Weka bili / Post a bill', '/#/inst/post'],
      rejected: ['Usajili haukukubaliwa / Registration declined', 'Usajili haukukubaliwa', [`Hatukuweza kuthibitisha ${i.name}.`, ...note],
        'Registration declined', [`We couldn't verify ${i.name}.`, ...note], null, null],
      suspended: ['Akaunti imesimamishwa / Account suspended', 'Akaunti imesimamishwa', [`Bili za ${i.name} hazionekani kwa sasa.`, ...note],
        'Account suspended', [`${i.name}'s bills are hidden for now.`, ...note], null, null]
    }[i.status];
    if (!msgs) return;
    await send(i.email, msgs[0], {
      sw: { title: msgs[1], lines: msgs[2] }, en: { title: msgs[3], lines: msgs[4] },
      link: msgs[6] ? APP_URL + msgs[6] : null, linkLabel: msgs[5]
    });
  });
}

function passwordReset(email, token) {
  later(async () => {
    await send(email, 'Weka nenosiri jipya / Reset your password', {
      sw: { title: 'Weka nenosiri jipya', lines: ['Bonyeza kitufe hapa chini ndani ya saa moja. Kama hukuomba, puuza ujumbe huu.'] },
      en: { title: 'Reset your password', lines: ['Use the button below within one hour. If you did not ask for this, ignore this email.'] },
      link: APP_URL + '/#/reset/' + token, linkLabel: 'Nenosiri jipya / New password'
    });
  });
}

module.exports = { passwordReset, paymentReported, paymentReviewed, institutionRegistered, institutionReviewed, layout };
