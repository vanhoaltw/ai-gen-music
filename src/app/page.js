"use client";

import { useState } from "react";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const values = Object.fromEntries(formData);

    const prompt = `Bài hát nói về cá nhân ${values.name} và ước mơ ${values.dream}`;

    let style = "";
    if (values.bpm > 80 && values.bpm < 105) {
      style = "Vui tươi, thoải mái";
    } else if (values.bpm > 105) {
      style = "Dồn dập, phấn khởi";
    } else {
      style = "Chậm rãi, thư giãn";
    }
    const response = await fetch("https://api.acedata.cloud/suno/audios", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${values.token}`,
      },
      body: JSON.stringify({
        action: "generate",
        prompt,
        model: "chirp-v3-5",
        style: style,
      }),
    });

    const data = await response.json();
    console.log({ data });
    if (data?.success) setData(data?.data);

    setIsLoading(false);
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)] bg-gray-100">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <form
          onSubmit={handleSubmit}
          className="space-y-sm w-96 border p-8 shadow-md rounded-md bg-white"
        >
          <div>
            <label htmlFor="token">Token</label>
            <input
              id="token"
              name="token"
              defaultValue={process.env.SUNO_TOKEN || ""}
            />
          </div>

          <div>
            <label htmlFor="name">Tên</label>
            <input id="name" name="name" />
          </div>
          <div>
            <label htmlFor="bpm">Nhịp tim</label>
            <input id="bpm" type="number" name="bpm" />
          </div>
          <div>
            <label htmlFor="dream">Ước mơ</label>
            <textarea id="dream" rows={5} name="dream" />
          </div>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Đang tạo..." : "Tạo bài hát"}
          </button>
        </form>

        <div classNames="space-y-2">
          {data?.map((item) => (
            <div
              key={item.id}
              className="p-4 border border-gray-200 shadow-sm bg-white"
            >
              <p className="font-bold text-base">{item.title}</p>
              <audio src={item.audio_url} controls />
              <div className="whitespace-pre-wrap min-w-0 break-words text-sm">
                {item.lyric}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
