import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import './PasswordInput.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * A password field with a button that shows what was typed (#262). The button sits
 * beside the field, not inside it, so it never covers the icon a password manager
 * draws at the right edge of the input.
 */
export function PasswordInput(props: Props) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className="password-input">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="password-input__toggle"
        aria-label={t(shown ? 'account.password.hide' : 'account.password.show')}
        title={t(shown ? 'account.password.hide' : 'account.password.show')}
        aria-pressed={shown}
        aria-controls={props.id}
        onClick={() => setShown((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          {shown && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
        </svg>
      </button>
    </div>
  );
}
