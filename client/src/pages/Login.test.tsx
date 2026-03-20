import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Login from './Login';

// Mock the hooks and services
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: any) => selector({ login: vi.fn() }),
}));

describe('Login Page', () => {
  it('renders login form', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(screen.getByText(/Representative Login/i)).toBeInTheDocument();
    expect(screen.getByText(/Work Email/i)).toBeInTheDocument();
    expect(screen.getByText(/Access Password/i)).toBeInTheDocument();
  });
});
