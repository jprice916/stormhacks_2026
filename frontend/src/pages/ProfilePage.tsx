import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { BrandMark } from '../components/BrandMark';
import { frontendPaths } from '../lib/paths';
import {
  changePassword,
  loadProfile,
  logoutUser,
  requestAccountDeletion,
  saveProfileName,
  saveProfilePicture,
  type Profile,
} from '../data/profileApi';
import './ProfilePage.css';

const maxPictureBytes = 2 * 1024 * 1024;
const allowedPictureTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const allowedPictureExtensions = ['.png', '.jpg', '.jpeg', '.webp'];

function DefaultPortrait() {
  return (
    <svg aria-label="A little hand-drawn sun over rolling hills" className="profile-portrait" role="img" viewBox="0 0 180 180">
      <circle cx="90" cy="90" r="84" fill="#f4e8ce" />
      <path d="M28 112c17-11 31-10 46 0 17-12 37-12 55-1 10-6 18-8 27-6v48H28z" fill="#b7b687" stroke="#665a3c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <path d="M35 130c20-10 37-7 54 4 17-9 37-11 67-1v21H35z" fill="#d29a77" stroke="#665a3c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <path d="M66 75c0-14 11-25 25-25s25 11 25 25" fill="none" stroke="#665a3c" strokeLinecap="round" strokeWidth="3" />
      <circle cx="91" cy="84" r="22" fill="#e4ad67" stroke="#665a3c" strokeWidth="3" />
      <path d="m72 35 4 7m-24 8 8 3m74-3-8 3m-16-18-4 7" fill="none" stroke="#8d7850" strokeLinecap="round" strokeWidth="3" />
      <path d="m53 111 2-2m19 7 2-2m65 3 2-2m-37 31 2-2" fill="none" stroke="#f8f2e5" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  visible,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="profile-field">
      <label className="profile-label" htmlFor={id}>{label}</label>
      <div className="profile-password-control">
        <input
          autoComplete={autoComplete}
          className="profile-input"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="profile-visibility-toggle"
          onClick={onToggle}
          type="button"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [requestMessage, setRequestMessage] = useState('');

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const formIsValid = Boolean(currentPassword && newPassword.length >= 8 && confirmPassword && newPassword === confirmPassword);

  function toggleVisibility(field: string) {
    setVisibleFields((fields) => ({ ...fields, [field]: !fields[field] }));
  }

  function updatePasswordField(update: (value: string) => void, value: string) {
    update(value);
    setRequestState('idle');
    setRequestMessage('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formIsValid || requestState === 'loading') return;
    setRequestState('loading');
    setRequestMessage('');
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (!result.ok) {
        setRequestState('error');
        setRequestMessage(result.message ?? 'We couldn’t change your password. Please try again.');
        return;
      }
      setRequestState('success');
      setRequestMessage('Your password has been changed. Nice and secure.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setRequestState('error');
      setRequestMessage('We couldn’t reach the server just now. Please try again in a moment.');
    }
  }

  return (
    <section aria-labelledby="password-title" className="profile-card password-card">
      <div className="profile-section-heading">
        <span aria-hidden="true" className="profile-section-icon profile-section-icon--password">
          <svg fill="none" viewBox="0 0 32 32">
            <rect height="14" rx="3" stroke="currentColor" strokeWidth="2" width="22" x="5" y="14" />
            <path d="M10 14V9a6 6 0 0 1 12 0v5m-6 6v3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </span>
        <div>
          <p className="profile-eyebrow">A little extra peace of mind</p>
          <h2 className="profile-section-title" id="password-title">Change password</h2>
        </div>
      </div>
      <form className="password-form" onSubmit={handleSubmit}>
        <PasswordField
          autoComplete="current-password"
          id="current-password"
          label="Current password"
          onChange={(value) => updatePasswordField(setCurrentPassword, value)}
          onToggle={() => toggleVisibility('current')}
          value={currentPassword}
          visible={Boolean(visibleFields.current)}
        />
        <div className="password-form-row">
          <PasswordField
            autoComplete="new-password"
            id="new-password"
            label="New password"
            onChange={(value) => updatePasswordField(setNewPassword, value)}
            onToggle={() => toggleVisibility('new')}
            value={newPassword}
            visible={Boolean(visibleFields.new)}
          />
          <PasswordField
            autoComplete="new-password"
            id="confirm-password"
            label="Confirm new password"
            onChange={(value) => updatePasswordField(setConfirmPassword, value)}
            onToggle={() => toggleVisibility('confirm')}
            value={confirmPassword}
            visible={Boolean(visibleFields.confirm)}
          />
        </div>
        {tooShort ? <p className="profile-form-note" role="status">A password needs at least 8 characters.</p> : null}
        {mismatch ? <p className="profile-form-note" role="status">Those passwords don’t match just yet.</p> : null}
        {requestMessage ? (
          <p className={`profile-request-message profile-request-message--${requestState}`} role={requestState === 'error' ? 'alert' : 'status'}>
            <span aria-hidden="true">{requestState === 'success' ? '✳' : '♡'}</span>
            {requestMessage}
          </p>
        ) : null}
        <div className="password-form-footer">
          <p className="password-hint">Choose 8 or more characters you haven’t used here before.</p>
          <button className="profile-button profile-button--primary" disabled={!formIsValid || requestState === 'loading'} type="submit">
            {requestState === 'loading' ? <><span aria-hidden="true" className="tiny-spinner" />Saving…</> : 'Save new password'}
            {requestState !== 'loading' ? <span aria-hidden="true">↗</span> : null}
          </button>
        </div>
      </form>
    </section>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [picturePreview, setPicturePreview] = useState('');
  const [pictureError, setPictureError] = useState('');
  const [isSavingPicture, setIsSavingPicture] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteState, setDeleteState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [deleteMessage, setDeleteMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef('');
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    loadProfile()
      .then((data) => { if (active) setProfile(data); })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error
          ? error.message
          : 'Your profile couldn’t be opened. Please try once more.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    if (!isDeleteOpen) return;
    deleteInputRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && deleteState !== 'loading') closeDeleteDialog();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      deleteButtonRef.current?.focus();
    };
  }, [isDeleteOpen, deleteState]);

  function closeDeleteDialog() {
    if (deleteState === 'success') {
      window.location.assign(frontendPaths.login);
      return;
    }
    setIsDeleteOpen(false);
    setDeletePhrase('');
    setDeleteState('idle');
    setDeleteMessage('');
  }

  function handlePictureChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPictureError('');

    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const validType = allowedPictureTypes.includes(file.type)
      || (!file.type && allowedPictureExtensions.includes(fileExtension));
    if (!validType) {
      setPictureError('Let’s use a PNG, JPG, or WebP picture.');
      return;
    }
    if (file.size > maxPictureBytes) {
      setPictureError('That picture is a little too large. Please choose one under 2 MB.');
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const localPreview = URL.createObjectURL(file);
    previewUrlRef.current = localPreview;
    setPicturePreview(localPreview);
    setIsSavingPicture(true);
    saveProfilePicture(file)
      .then((updatedProfile) => {
        if (previewUrlRef.current !== localPreview) return;
        setProfile(updatedProfile);
        setPicturePreview('');
        URL.revokeObjectURL(localPreview);
        previewUrlRef.current = '';
      })
      .catch((error: unknown) => {
        if (previewUrlRef.current === localPreview) {
          setPictureError(error instanceof Error
            ? error.message
            : 'We couldn’t save that picture. Your preview is still here; please try again.');
        }
      })
      .finally(() => setIsSavingPicture(false));
  }

  async function handleSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setNameError('Your name can’t be empty.');
      return;
    }
    setNameError('');
    setIsSavingName(true);
    try {
      setProfile(await saveProfileName(trimmedName));
      setIsEditingName(false);
    } catch (error) {
      setNameError(error instanceof Error
        ? error.message
        : 'We couldn’t save your name just now. Please try again.');
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deletePhrase !== 'delete' || deleteState === 'loading') return;
    setDeleteState('loading');
    try {
      await requestAccountDeletion(deletePhrase);
      setDeleteState('success');
      setDeleteMessage('Your account and saved moments have been deleted.');
    } catch (error) {
      setDeleteState('error');
      setDeleteMessage(error instanceof Error
        ? error.message
        : 'We couldn’t delete your account. Please try again.');
    }
  }

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      await logoutUser();
      window.location.assign(frontendPaths.login);
    } catch (error) {
      setLogoutError(error instanceof Error
        ? error.message
        : 'We couldn’t sign you out. Please try again.');
      setIsLoggingOut(false);
    }
  }

  const displayName = profile?.name ?? '';
  const avatarUrl = picturePreview || profile?.avatarUrl;

  return (
    <main className="profile-page">
      <div className="profile-shell">
        <header className="profile-topbar">
          <a aria-label="Week by week home" className="profile-brand" href={frontendPaths.home}>
            <BrandMark className="profile-brand-logo" />
            <span>Week by week</span>
          </a>
          <nav aria-label="Main navigation" className="profile-navigation">
            <a href={frontendPaths.weekly}>My weeks</a>
            <span aria-current="page" className="profile-current-page">Profile</span>
            <button className="profile-button profile-button--quiet profile-button--small" disabled={isLoggingOut} onClick={handleLogout} type="button">
              {isLoggingOut ? 'Signing out…' : 'Log out'}
            </button>
          </nav>
        </header>

        {logoutError ? <p className="profile-inline-error" role="alert">{logoutError}</p> : null}

        <div className="profile-page-intro">
          <div>
            <p className="profile-eyebrow">YOUR LITTLE CORNER</p>
            <p className="profile-page-caption">A few details, all yours.</p>
          </div>
          <svg aria-hidden="true" className="profile-intro-doodle" fill="none" viewBox="0 0 100 64">
            <path d="M13 42c8-6 13-18 16-31 4 13 8 25 17 31m-17-9c-5 0-10-3-14-8m15 1c6-1 10-4 14-9M60 12c5 7 10 10 18 12-8 2-13 5-18 12-2-7-6-10-13-12 7-2 11-5 13-12Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            <circle cx="87" cy="47" r="3" fill="currentColor" />
          </svg>
        </div>

        {loadError ? (
          <div className="profile-load-message" role="alert">
            <p className="profile-handwritten">{loadError}</p>
            <button className="profile-button profile-button--quiet" onClick={() => window.location.reload()} type="button">Try again</button>
          </div>
        ) : isLoading || !profile ? (
          <div aria-live="polite" className="profile-load-message profile-handwritten">Opening your profile…</div>
        ) : (
          <>
            <section aria-label="Your profile details" className="profile-hero">
              <div className="avatar-column">
                <div className="avatar-frame">
                  {avatarUrl ? (
                    <img alt={`${displayName}’s profile`} className="profile-portrait" src={avatarUrl} />
                  ) : <DefaultPortrait />}
                </div>
                <button className="profile-button profile-button--picture" disabled={isSavingPicture} onClick={() => fileInputRef.current?.click()} type="button">
                  <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
                    <path d="m11.8 5.2 3 3m-9.6 6.6 3.2-.7 7.7-7.7a2.1 2.1 0 0 0-3-3l-7.7 7.7-.7 3.7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                  </svg>
                  {isSavingPicture ? 'Saving picture…' : 'Change picture'}
                </button>
                <input
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  aria-label="Choose a profile picture"
                  className="profile-file-input"
                  onChange={handlePictureChange}
                  ref={fileInputRef}
                  tabIndex={-1}
                  type="file"
                />
                {pictureError ? <p className="profile-inline-error" role="alert">{pictureError}</p> : null}
                <p className="avatar-hint">PNG, JPG or WebP · up to 2 MB</p>
              </div>

              <div className="profile-identity">
                <p className="profile-eyebrow">A little more you</p>
                {isEditingName ? (
                  <form className="name-edit-form" onSubmit={handleSaveName}>
                    <label className="profile-visually-hidden" htmlFor="profile-name">Your name</label>
                    <input
                      autoFocus
                      className="profile-name-input profile-handwritten"
                      disabled={isSavingName}
                      id="profile-name"
                      maxLength={60}
                      onChange={(event) => { setNameDraft(event.target.value); setNameError(''); }}
                      value={nameDraft}
                    />
                    {nameError ? <p className="profile-inline-error" role="alert">{nameError}</p> : null}
                    <div className="name-edit-actions">
                      <button className="profile-button profile-button--primary profile-button--small" disabled={isSavingName} type="submit">
                        {isSavingName ? 'Saving…' : 'Save name'}
                      </button>
                      <button className="profile-button profile-button--quiet profile-button--small" disabled={isSavingName} onClick={() => { setIsEditingName(false); setNameError(''); }} type="button">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="profile-name-row">
                    <h1 className="profile-name profile-handwritten">{displayName}</h1>
                    <button
                      aria-label="Edit your name"
                      className="profile-edit-name"
                      onClick={() => { setNameDraft(displayName); setIsEditingName(true); }}
                      type="button"
                    >
                      <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
                        <path d="m11.8 5.2 3 3m-9.6 6.6 3.2-.7 7.7-7.7a2.1 2.1 0 0 0-3-3l-7.7 7.7-.7 3.7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                      </svg>
                      <span>Edit</span>
                    </button>
                  </div>
                )}
                <p className="profile-email">
                  <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
                    <rect height="12" rx="2.2" stroke="currentColor" strokeWidth="1.4" width="15" x="2.5" y="4" />
                    <path d="m3.5 5 6.5 5 6.5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
                  </svg>
                  {profile.email}
                </p>
                <div className="profile-note-card">
                  <span aria-hidden="true" className="profile-note-sparkle">✳</span>
                  <p className="profile-handwritten">Little by little is still forward.</p>
                </div>
                <button
                  className="profile-button profile-button--quiet profile-button--small profile-signout-button"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  type="button"
                >
                  {isLoggingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
              <svg aria-hidden="true" className="profile-hero-doodle" fill="none" viewBox="0 0 74 78">
                <path d="M36 8c2 12 8 17 21 19-13 3-19 8-21 22-3-14-8-19-21-22 13-2 18-7 21-19Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M62 54c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
            </section>

            <PasswordCard />

            <section aria-labelledby="delete-title" className="delete-section">
              <div>
                <p className="profile-eyebrow">If you’re sure</p>
                <h2 className="delete-title profile-handwritten" id="delete-title">Ready to close this little chapter?</h2>
                <p className="delete-copy">Delete your account and the moments you’ve saved.</p>
              </div>
              <button
                className="profile-button profile-button--warm"
                disabled={deleteState === 'success'}
                onClick={() => setIsDeleteOpen(true)}
                ref={deleteButtonRef}
                type="button"
              >
                {deleteState === 'success' ? 'Account deleted' : 'Delete account'}
              </button>
            </section>
          </>
        )}

        <footer className="profile-footer">
          <span>Week by week</span>
          <span>A calm place to notice how far you have come.</span>
        </footer>
      </div>

      {isDeleteOpen ? (
        <div className="profile-modal-backdrop" role="presentation">
          <section aria-describedby="delete-description" aria-labelledby="delete-modal-title" aria-modal="true" className="profile-modal" role="dialog">
            <span aria-hidden="true" className="modal-doodle">♡</span>
            {deleteState === 'success' ? (
              <div className="delete-success">
                <p className="profile-eyebrow">Received</p>
                <h2 className="profile-modal-title profile-handwritten" id="delete-modal-title">Your account is deleted.</h2>
                <p className="profile-modal-copy" id="delete-description">{deleteMessage}</p>
                <button className="profile-button profile-button--primary" onClick={closeDeleteDialog} type="button">Done for now</button>
              </div>
            ) : (
              <>
                <p className="profile-eyebrow">One last check</p>
                <h2 className="profile-modal-title profile-handwritten" id="delete-modal-title">Are you sure you want to leave?</h2>
                <p className="profile-modal-copy" id="delete-description">All your saved moments and account details will be removed. Type <strong>delete</strong> below to continue.</p>
                <form className="delete-form" onSubmit={handleDeleteAccount}>
                  <label className="profile-label" htmlFor="delete-confirmation">Type delete to confirm</label>
                  <input
                    autoComplete="off"
                    className="profile-input"
                    disabled={deleteState === 'loading'}
                    id="delete-confirmation"
                    onChange={(event) => { setDeletePhrase(event.target.value); setDeleteState('idle'); setDeleteMessage(''); }}
                    ref={deleteInputRef}
                    spellCheck={false}
                    value={deletePhrase}
                  />
                  {deleteMessage ? <p className="profile-inline-error" role="alert">{deleteMessage}</p> : null}
                  <div className="delete-actions">
                    <button className="profile-button profile-button--primary" disabled={deletePhrase !== 'delete' || deleteState === 'loading'} type="submit">
                      {deleteState === 'loading' ? <><span aria-hidden="true" className="tiny-spinner" />Deleting…</> : 'Yes, delete my account'}
                    </button>
                    <button className="profile-button profile-button--quiet" disabled={deleteState === 'loading'} onClick={closeDeleteDialog} type="button">Keep my account</button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
