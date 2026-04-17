import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Send } from 'lucide-react'

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

const plans = [
  {
    name: 'Starter',
    price: 29,
    description: 'For individuals testing AI outbound.',
    features: [
      '500 AI messages / month',
      '50 AI-powered searches',
      '3 active campaigns',
      'Basic campaign analytics',
      'Email support',
    ],
    cta: 'Get started',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: 50,
    description: 'For teams scaling their outreach pipeline.',
    features: [
      '2,000 AI messages / month',
      '200 AI-powered searches',
      '10 active campaigns',
      'Advanced analytics & reports',
      'CSV import / export',
      'Priority support',
    ],
    cta: 'Get started',
    highlighted: true,
    badge: 'Most popular',
  },
  {
    name: 'Scale',
    price: 100,
    description: 'For high-volume outbound operations.',
    features: [
      '10,000 AI messages / month',
      '500 AI-powered searches',
      '25 active campaigns',
      'Full analytics dashboard',
      'API access',
      'Dedicated support',
      'Custom message templates',
    ],
    cta: 'Get started',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: null,
    description: 'For organizations with custom needs.',
    features: [
      'Custom message volume',
      'Custom search volume',
      'Tailored campaign limits',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'White-label options',
      'Bespoke AI configuration',
    ],
    cta: 'Contact us',
    highlighted: false,
  },
]

export default function PricingPage() {
  const isMobile = useIsMobile()
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Nav */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(250,249,247,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)' }}>
            <div style={{ width: 32, height: 32, background: 'var(--ink)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send style={{ width: 16, height: 16, color: 'white' }} />
            </div>
            <span className="serif" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>Tellem</span>
          </Link>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/login" className="btn-ghost" style={{ padding: '9px 18px', fontSize: 13 }}>Sign in</Link>
            <Link to="/register" className="btn-primary" style={{ padding: '9px 18px', fontSize: 13 }}>
              Get started <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section style={{ padding: '140px 24px 60px', textAlign: 'center' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h1 className="serif" style={{ fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontSize: 17, color: 'var(--ink-soft)', lineHeight: 1.7, maxWidth: 500, margin: '0 auto' }}>
            Pay for what you use. Scale when you're ready. No hidden fees.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section style={{ padding: '0 24px 120px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 16, alignItems: 'start' }}>
          {plans.map((plan) => (
            <div
              key={plan.name}
              style={{
                background: plan.highlighted ? 'var(--ink)' : 'var(--card)',
                color: plan.highlighted ? 'white' : 'var(--ink)',
                border: plan.highlighted ? 'none' : '1px solid var(--border)',
                borderRadius: 16,
                padding: 32,
                position: 'relative',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              {plan.badge && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--teal)', color: 'white', fontSize: 11, fontWeight: 700,
                  padding: '4px 14px', borderRadius: 100, letterSpacing: '0.02em', whiteSpace: 'nowrap',
                }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{plan.name}</h3>
                <p style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.6, marginBottom: 20 }}>{plan.description}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  {plan.price !== null ? (
                    <>
                      <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em' }}>${plan.price}</span>
                      <span style={{ fontSize: 14, opacity: 0.6 }}>/mo</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Custom</span>
                  )}
                </div>
              </div>

              <Link
                to={plan.price !== null ? '/register' : '#'}
                onClick={plan.price === null ? (e) => { e.preventDefault(); window.location.href = 'mailto:hello@tellem.ai?subject=Enterprise inquiry'; } : undefined}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '12px 20px', borderRadius: 100, fontSize: 14, fontWeight: 600,
                  textDecoration: 'none', marginBottom: 28, transition: 'all 0.2s', cursor: 'pointer',
                  background: plan.highlighted ? 'white' : 'var(--ink)',
                  color: plan.highlighted ? 'var(--ink)' : 'white',
                  border: 'none',
                }}
              >
                {plan.cta} <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Check style={{
                      width: 16, height: 16, flexShrink: 0, marginTop: 1,
                      color: plan.highlighted ? 'var(--teal)' : 'var(--teal)',
                    }} />
                    <span style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ-style bottom section */}
      <section style={{ padding: '80px 24px', background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.02em' }}>Not sure which plan is right?</h2>
          <p style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 32 }}>
            Start with Starter and upgrade anytime. Your campaigns and contacts carry over when you scale.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link to="/register" className="btn-primary" style={{ padding: '13px 28px', fontSize: 14 }}>
              Start free trial <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'var(--ink)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send style={{ width: 13, height: 13, color: 'white' }} />
            </div>
            <span className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Tellem</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>&copy; 2026 Tellem. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
