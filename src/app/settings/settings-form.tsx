"use client";

import { useState } from "react";

type Props = {
  twoFactorEnabled: boolean;
  phone: string | null;
};

export function SettingsForm({ twoFactorEnabled, phone }: Props) {
  return (
    <div className="space-y-10">
      <PasswordSection />
      <TwoFactorSection
        initialEnabled={twoFactorEnabled}
        initialPhone={phone}
      />
    </div>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setMessage("Password updated");
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Change password</h2>

      <div className="space-y-1">
        <label className="text-sm font-medium">Current password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">New password</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

function TwoFactorSection({
  initialEnabled,
  initialPhone,
}: {
  initialEnabled: boolean;
  initialPhone: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/2fa/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setAwaitingCode(true);
    setMessage("Code sent via text message");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Invalid code");
      return;
    }

    setEnabled(true);
    setAwaitingCode(false);
    setCode("");
    setMessage("Two-factor authentication enabled");
  }

  async function handleDisable() {
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/settings/2fa/disable", { method: "POST" });

    setLoading(false);

    if (!res.ok) {
      setError("Something went wrong");
      return;
    }

    setEnabled(false);
    setMessage("Two-factor authentication disabled");
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Two-factor authentication (SMS)</h2>

      {enabled ? (
        <>
          <p className="text-sm text-gray-500">
            2FA is enabled for this account.
          </p>
          <button
            onClick={handleDisable}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Please wait…" : "Disable 2FA"}
          </button>
        </>
      ) : awaitingCode ? (
        <form onSubmit={handleVerify} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Enter the code we texted you
            </label>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm tracking-widest"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify & enable"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleEnroll} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Phone number</label>
            <input
              type="tel"
              required
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send verification code"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  );
}
