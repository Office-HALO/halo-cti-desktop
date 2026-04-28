import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const FORWARD_TO = Deno.env.get('FORWARD_TO') ?? ''; // 転送先電話番号（例: +819012345678）

// Twilio署名の検証（HMAC-SHA1）
async function validateSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) return false;
  const signature = req.headers.get('x-twilio-signature') ?? '';
  const url = req.url;
  const params = new URLSearchParams(rawBody);
  const sorted = [...params.keys()].sort();
  let strToSign = url;
  for (const k of sorted) strToSign += k + (params.get(k) ?? '');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(TWILIO_AUTH_TOKEN),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const raw = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(strToSign));
  const expected = btoa(String.fromCharCode(...new Uint8Array(raw)));
  return signature === expected;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const rawBody = await req.text();

  // 本番では署名検証を有効にする（開発中はスキップ可）
  const skipValidation = Deno.env.get('SKIP_SIGNATURE_VALIDATION') === 'true';
  if (!skipValidation) {
    const valid = await validateSignature(req, rawBody);
    if (!valid) {
      console.error('Invalid Twilio signature');
      return new Response('Forbidden', { status: 403 });
    }
  }

  const params = new URLSearchParams(rawBody);
  const callSid     = params.get('CallSid')     ?? '';
  const fromNumber  = params.get('From')        ?? '';
  const toNumber    = params.get('To')          ?? '';
  const callStatus  = params.get('CallStatus')  ?? 'ringing';

  console.log(`[twilio-webhook] ${callStatus} from=${fromNumber} to=${toNumber} sid=${callSid}`);

  // Supabase に着信ログを登録
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await supabase.from('call_logs').upsert(
    {
      call_sid:        callSid,
      from_number:     fromNumber,
      to_number:       toNumber,
      started_at:      new Date().toISOString(),
      status:          callStatus,
      callback_status: 'none',
    },
    { onConflict: 'call_sid' }, // 同一通話の重複通知をスキップ
  );
  if (error) console.error('[twilio-webhook] DB error:', error.message);

  // TwiML: 転送先があれば転送、なければ音声案内のみ
  const twiml = FORWARD_TO
    ? `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" callerId="${toNumber}">
    <Number>${FORWARD_TO}</Number>
  </Dial>
</Response>`
    : `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ja-JP">お電話ありがとうございます。</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
});
