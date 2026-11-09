'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../components/auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { TextField } from '../../components/ui/TextField';
import { ApiError } from '../../lib/api';

function LoginForm() {
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const expired = searchParams.get('motivo') === 'sessao';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(expired ? 'Sua sessão expirou. Entre novamente.' : '');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Não foi possível conectar à API. Confirme se o backend e o PostgreSQL estão no ar.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <div>
          <span className="brand-mark" aria-hidden="true">B7</span>
          <h1>B7 Solar</h1>
          <p>Plataforma de Gestão</p>
          <small>Operação, monitoramento e inteligência para usinas fotovoltaicas.</small>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={onSubmit}>
          <h2>Acessar a plataforma</h2>
          <p>Entre com suas credenciais para continuar.</p>
          {error ? <div className="login-error" role="alert">{error}</div> : null}
          <TextField id="email" label="Usuário" type="text" value={email} onChange={setEmail} placeholder="Usuário ou e-mail" />
          <TextField id="senha" label="Senha" type="password" value={password} onChange={setPassword} placeholder="Digite sua senha" />
          <Button type="submit" disabled={submitting}>{submitting ? 'Entrando...' : 'Entrar'}</Button>
        </form>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando..." />}>
      <LoginForm />
    </Suspense>
  );
}
