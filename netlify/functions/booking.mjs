const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbzH5utFOekZAaxWcHIpDLwIdw5hy5Z3Hmd1JLr1h9wGLVf8_SdZPQgRE1PVKz5JzHmUmw/exec";

export default async (request) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Method not allowed." }), { status: 405, headers });
  }

  try {
    const payload = await request.json();
    const token = String(payload && payload.token || "").trim();
    const action = String(payload && payload.action || "");
    if (!/^[a-f0-9]{32}$/i.test(token)) {
      return new Response(JSON.stringify({ ok: false, message: "This booking link is invalid or expired." }), { status: 400, headers });
    }

    let gasPayload;
    if (action === "details") {
      gasPayload = { type: "founder_booking_details", token };
    } else if (action === "confirm") {
      const slot = Number(payload.slot);
      if (![1, 2, 3].includes(slot)) {
        return new Response(JSON.stringify({ ok: false, message: "Please select one of the available session times." }), { status: 400, headers });
      }
      gasPayload = { type: "founder_booking", token, slot };
    } else {
      return new Response(JSON.stringify({ ok: false, message: "Unknown booking action." }), { status: 400, headers });
    }

    const upstream = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(gasPayload),
      redirect: "follow"
    });
    const raw = await upstream.text();
    let result;
    try { result = JSON.parse(raw); }
    catch (_) { throw new Error("The booking service returned an unreadable response. Please try again."); }

    if (result && result.ok) {
      result.payment = {
        fee: "₹5,500",
        upiId: "natunic@kotak",
        accountHolder: "UNIC",
        bankName: "Kotak Mahindra Bank",
        accountNumber: "0646313731",
        ifsc: "KKBK0002563",
        branch: "AHMEDABAD - ODHAV",
        paymentDeadlineHours: 24,
        qrImageUrl: "/assets/unic-kotak-upi-qr.png"
      };
    }

    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: error && error.message ? error.message : "Booking service temporarily unavailable." }), { status: 502, headers });
  }
};
