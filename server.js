async function sendToGoogleDrive(data) {
  const response = await fetch(
    process.env.GOOGLE_APPS_SCRIPT_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        secret: process.env.GOOGLE_APPS_SCRIPT_SECRET,
        ...data
      })
    }
  );

  return await response.json();
}
