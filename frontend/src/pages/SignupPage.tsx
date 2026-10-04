import { useState, type FormEvent } from 'react';

type SignupResponse = {
  message?: string;
  redirect?: string;
};

export function SignupPage() {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          email: form.get('email'),
          password: form.get('password'),
          confirmPassword: form.get('confirm_password'),
        }),
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`The sign-up service returned an unexpected response (HTTP ${response.status}).`);
      }

      const result = await response.json() as SignupResponse;
      if (!response.ok) {
        setError(result.message || 'Could not create your account. Please try again.');
        return;
      }

      window.location.assign(result.redirect || '/static/frontend/profile');
    } catch (error) {
      setError(error instanceof TypeError
        ? 'Could not reach the sign-up service. Check that Flask is running and try again.'
        : error instanceof Error
          ? error.message
          : 'Could not create your account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f9f6f1] px-5 py-12 text-[#473c21]">
      <section className="w-full max-w-md border-2 border-[#473c21] bg-[#f9f6f1] p-7 shadow-[7px_7px_0_#b39e6c] sm:p-10">
        <a className="font-serif text-lg italic text-[#887445]" href="/static/frontend/">
          Week by week
        </a>
        <p className="mt-10 text-xs font-medium uppercase tracking-[0.17em] text-[#887445]">
          StormHacks 2026
        </p>
        <h1 className="mt-3 font-serif text-4xl">Create account</h1>
        <p className="mt-3 text-sm leading-6 text-[#887445]">
          Start keeping the small moments that make up your week.
        </p>

        {error && <p className="mt-6 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="username">Username</label>
            <input
              autoComplete="username"
              autoFocus
              className="w-full border-2 border-[#bca880] bg-white px-3 py-3 text-base outline-none focus:border-[#473c21]"
              id="username"
              maxLength={80}
              minLength={3}
              name="username"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="email">Email</label>
            <input
              autoComplete="email"
              className="w-full border-2 border-[#bca880] bg-white px-3 py-3 text-base outline-none focus:border-[#473c21]"
              id="email"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="password">Password</label>
            <input
              autoComplete="new-password"
              className="w-full border-2 border-[#bca880] bg-white px-3 py-3 text-base outline-none focus:border-[#473c21]"
              id="password"
              maxLength={128}
              minLength={8}
              name="password"
              required
              type="password"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="confirm-password">Confirm password</label>
            <input
              autoComplete="new-password"
              className="w-full border-2 border-[#bca880] bg-white px-3 py-3 text-base outline-none focus:border-[#473c21]"
              id="confirm-password"
              maxLength={128}
              minLength={8}
              name="confirm_password"
              required
              type="password"
            />
          </div>
          <button
            className="min-h-12 w-full border-2 border-[#473c21] bg-[#473c21] px-5 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] transition-colors hover:bg-[#887445] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21] disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-7 text-sm text-[#887445]">
          Already have an account? <a className="font-medium text-[#473c21] underline underline-offset-4" href="/static/frontend/login">Sign in</a>
        </p>
      </section>
    </main>
  );
}
