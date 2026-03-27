async function run() {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-or-v1-fake' },
        body: JSON.stringify({
            model: 'qwen/qwen3.5-9b',
            messages: [{role: 'user', content: 'test'}]
        })
    });
    console.log(await res.text());
}
run();
