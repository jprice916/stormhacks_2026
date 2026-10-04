import { useState, type FormEvent } from 'react';

export function LoginPage() {
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const response = await fetch(`/api/login${window.location.search}`, {
                method: 'POST',
                body: new FormData(event.currentTarget),
            });
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                if (!response.ok) {
                    throw new Error(`The sign-in service returned an error (${response.status}). Check the Flask terminal for details.`);
                }
                throw new Error('The sign-in service returned an unexpected response. Check that Flask is running.');
            }

            const result = await response.json();

            if (!response.ok) {
                setError(result.message || 'Could not sign in. Please try again.');
                return;
            }

            window.location.assign(result.redirect || '/static/frontend/profile');
        } catch (error) {
            setError(error instanceof TypeError
                ? 'Could not reach Flask. Start the Flask app with “python run.py” and try again.'
                : error instanceof Error
                    ? error.message
                    : 'Could not sign in. Please try again.');
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
                <h1 className="mt-3 font-serif text-4xl">Welcome back</h1>
                <p className="mt-3 text-sm leading-6 text-[#887445]">
                    Sign in to continue to your recording studio.
                </p>

                {error && <p className="mt-6 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}

                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                    <div>
                        <label className="mb-2 block text-sm font-medium" htmlFor="identity">
                            Username or email
                        </label>
                        <input
                            className="w-full border-2 border-[#bca880] bg-white px-3 py-3 text-base outline-none focus:border-[#473c21]"
                            id="identity"
                            name="identity"
                            type="text"
                            autoComplete="username"
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium" htmlFor="password">
                            Password
                        </label>
                        <input
                            className="w-full border-2 border-[#bca880] bg-white px-3 py-3 text-base outline-none focus:border-[#473c21]"
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#887445]">
                        <input className="h-4 w-4 accent-[#473c21]" name="remember" type="checkbox" value="true" />
                        Keep me signed in
                    </label>
                    <button
                        className="min-h-12 w-full border-2 border-[#473c21] bg-[#473c21] px-5 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] transition-colors hover:bg-[#887445] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21]"
                        disabled={isSubmitting}
                        type="submit"
                    >
                        {isSubmitting ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
                <p className="mt-7 text-sm text-[#887445]">
                    New here? <a className="font-medium text-[#473c21] underline underline-offset-4" href="/static/frontend/signup">Create an account</a>
                </p>
            </section>
        </main>
    );
}
