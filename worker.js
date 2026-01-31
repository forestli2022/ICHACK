export default {
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const body = await req.text();

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://dashboard.teacher.pro",
        "X-Title": "Teacher Phonics Helper",
      },
      body,
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};
