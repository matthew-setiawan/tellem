import { Link } from 'react-router-dom'
import {
  ArrowRight, Check, MessageCircle, Zap, Users,
  Play, Send, Briefcase, User2, Handshake, Lightbulb, Star,
  Search, Target, Bot, Trophy
} from 'lucide-react'
import { useState, useEffect } from 'react'
import ChatInterfaceMockup from '../components/ChatInterfaceMockup'

const useCases = [
  {
    id: 'consulting', title: 'Find Consultants', icon: <Briefcase className="w-5 h-5" />,
    color: '#00a896', bg: 'var(--teal-soft)',
    headline: 'Client sets budget. Bot finds the perfect fit.',
    flow: ['Post your need + budget', 'Tellem talks to consultants', 'Compare profiles & pricing', 'Book paid discovery call'],
    benefit: 'Cut sourcing time from weeks to hours', metric: '10,000+ vetted consultants',
  },
  {
    id: 'hiring', title: 'Fast Hiring', icon: <User2 className="w-5 h-5" />,
    color: '#0066cc', bg: 'var(--blue-soft)',
    headline: 'Post a role. Bot screens candidates 24/7.',
    flow: ['Upload job description', 'Tellem engages candidates', 'Candidates answer qualifying questions', 'Book interviews with screened pool'],
    benefit: 'Fill roles 3x faster, zero manual screening', metric: '500K+ candidates on platform',
  },
  {
    id: 'deals', title: 'Deal Sourcing', icon: <Handshake className="w-5 h-5" />,
    color: '#ff6b35', bg: '#ffebdb',
    headline: 'Find acquisition targets without cold-calling.',
    flow: ['Describe ideal business (size, revenue, industry)', 'Tellem finds & qualifies sellers', 'Sellers book intro calls', 'You only talk to qualified prospects'],
    benefit: '10x more qualified deal flow', metric: 'Multi-million $ in closed deals',
  },
  {
    id: 'cofounders', title: 'Find Cofounders', icon: <Lightbulb className="w-5 h-5" />,
    color: '#7c3aed', bg: '#f3e8ff',
    headline: 'Match with your cofounder or investor via AI.',
    flow: ['Describe your vision & what you need', 'Tellem matches with potential partners', 'Initial conversations via bot', 'Book meetings with the right people'],
    benefit: 'Find your match without networking', metric: '1000+ founders connected',
  },
]

const features = [
  { title: 'WhatsApp Outreach', desc: 'Reach people where they actually respond.', icon: <MessageCircle className="w-5 h-5" /> },
  { title: 'AI-Powered Search', desc: 'Find anyone by role, company, or criteria.', icon: <Zap className="w-5 h-5" /> },
  { title: 'Per-Number Targeting', desc: 'Add individual numbers and set custom objectives.', icon: <Check className="w-5 h-5" /> },
  { title: 'Campaign Execution', desc: 'AI generates personalized messages and sends at scale.', icon: <Users className="w-5 h-5" /> },
]

const testimonials = [
  { quote: 'I was drowning in consultant inquiries. Now the bot handles it all. I only talk to 3-4 pre-qualified matches a week.', name: 'Alex Chen', role: 'VP Strategy', company: 'Fortune 500 Tech' },
  { quote: 'Filling a role used to take 6 weeks. With Tellem, qualified candidates book interviews in 48 hours.', name: 'Jordan Lee', role: 'Head of Talent', company: 'Venture Studio' },
  { quote: 'I bought 3 businesses last year. Cold-calling was 40% of my time. Now the bot handles all of it.', name: 'Morgan Park', role: 'Acquisitions Lead', company: 'Digital Holding Co' },
  { quote: 'Finding a cofounder felt impossible. Posted on Tellem, and within 2 weeks had 10 qualified matches.', name: 'Priya Singh', role: 'Founder', company: 'PropTech Startup' },
]

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

export default function LandingPage() {
  const [activeUseCase, setActiveUseCase] = useState('consulting')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  const current = useCases.find((u) => u.id === activeUseCase)

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Nav */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(250,249,247,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, background: 'var(--ink)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send style={{ width: 16, height: 16, color: 'white' }} />
            </div>
            <span className="serif" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>Tellem</span>
          </div>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 32 }}>
              {[['How it works', '#how'], ['Use cases', '#cases'], ['Features', '#features'], ['Pricing', '/pricing']].map(([l, h]) => (
                h.startsWith('/') ? (
                  <Link key={l} to={h} style={{ fontSize: 14, color: 'var(--ink-soft)', textDecoration: 'none', fontWeight: 500 }}>{l}</Link>
                ) : (
                  <a key={l} href={h} style={{ fontSize: 14, color: 'var(--ink-soft)', textDecoration: 'none', fontWeight: 500 }}>{l}</a>
                )
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isMobile && <Link to="/login" className="btn-ghost" style={{ padding: '9px 18px', fontSize: 13 }}>Sign in</Link>}
            <Link to="/register" className="btn-primary" style={{ padding: '9px 18px', fontSize: 13 }}>
              Get started <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 24px 80px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '10%', right: '5%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(0,168,150,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '5%', left: '8%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(0,102,204,0.06) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 900, textAlign: 'center', position: 'relative' }}>
          <div className="anim-fade-up tag" style={{ margin: '0 auto 40px', justifyContent: 'center' }}>
            <span className="anim-pulse-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', marginRight: 4 }} />
            AI-powered outbound that actually works
          </div>
          <h1 className="serif anim-fade-up delay-1" style={{ fontSize: 'clamp(48px, 8vw, 84px)', lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 32, fontWeight: 600 }}>
            AI finds. Reaches out.<br />
            <span style={{ color: 'var(--teal)' }}>You close.</span>
          </h1>
          <p className="anim-fade-up delay-2" style={{ fontSize: 'clamp(16px, 2vw, 19px)', color: 'var(--ink-soft)', lineHeight: 1.75, maxWidth: 620, margin: '0 auto 48px', fontWeight: 300 }}>
            Search for anyone by role, company, or criteria. Add numbers directly. Set objectives. Tellem handles outreach via WhatsApp with personalized messages at scale.
          </p>
          <div className="anim-fade-up delay-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 60 }}>
            <Link to="/register" className="btn-primary" style={{ padding: '15px 32px', fontSize: 15 }}>
              Get started free <ArrowRight style={{ width: 16, height: 16 }} />
            </Link>
            <button className="btn-ghost" style={{ padding: '15px 32px', fontSize: 15 }}>
              <Play style={{ width: 14, height: 14 }} /> Watch demo
            </button>
          </div>
          <div className="anim-fade-up delay-4" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 20 : 40, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
            {[{ n: 'AI Search', l: 'Find anyone' }, { n: 'WhatsApp', l: 'Direct outreach' }, { n: '24/7', l: 'Always on' }, { n: 'Per #', l: 'Target anyone' }].map((s) => (
              <div key={s.n} style={{ textAlign: 'center' }}>
                <div className="serif" style={{ fontSize: 28, letterSpacing: '-0.02em' }}>{s.n}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ padding: '100px 24px 120px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <div className="section-label" style={{ marginBottom: 14 }}>The Process</div>
            <h2 className="serif" style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1 }}>4 steps to qualified meetings</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 20 }}>
            {[
              { n: '1', icon: <Search className="w-5 h-5" />, title: 'Search or add numbers', desc: 'AI search or manually add phone numbers.' },
              { n: '2', icon: <Target className="w-5 h-5" />, title: 'Set your objective', desc: 'Tell Tellem what you want to achieve.' },
              { n: '3', icon: <Bot className="w-5 h-5" />, title: 'AI sends messages', desc: 'Personalized WhatsApp outreach at scale.' },
              { n: '4', icon: <Trophy className="w-5 h-5" />, title: 'You close the deal', desc: 'Only talk to engaged, interested people.' },
            ].map((step) => (
              <div key={step.n} className="card flow-step" style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.1em', marginBottom: 16 }}>STEP {step.n}</div>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--teal-soft)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>{step.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{step.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.75 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="cases" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Use Cases</div>
            <h2 className="serif" style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 600, letterSpacing: '-0.03em' }}>Works for any outbound need</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: isMobile ? 30 : 60 }}>
            {useCases.map((uc) => (
              <button key={uc.id} onClick={() => setActiveUseCase(uc.id)} style={{
                padding: 20, borderRadius: 16,
                border: activeUseCase === uc.id ? `2px solid ${uc.color}` : '1px solid var(--border)',
                background: activeUseCase === uc.id ? uc.bg : 'var(--card)',
                cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{uc.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: activeUseCase === uc.id ? uc.color : 'var(--ink)' }}>{uc.title}</div>
              </button>
            ))}
          </div>
          {current && (
            <div className="anim-fade-in card" style={{ padding: isMobile ? 24 : 60, background: current.bg }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 24 : 60, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: current.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Use case</div>
                  <h3 className="serif" style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 20, lineHeight: 1.15 }}>{current.headline}</h3>
                  <p style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.8, marginBottom: 32 }}>{current.benefit}</p>
                  <div style={{ fontSize: 14, fontWeight: 700, color: current.color }}>{current.metric}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {current.flow.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: current.bg, color: current.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, border: `2px solid ${current.color}` }}>{i + 1}</div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', paddingTop: 4 }}>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Chat Demo */}
      <section style={{ padding: '100px 24px 120px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <div className="section-label" style={{ marginBottom: 14 }}>The Product</div>
            <h2 className="serif anim-fade-up" style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 20 }}>See Tellem in action</h2>
            <p className="anim-fade-up delay-1" style={{ fontSize: 16, color: 'var(--ink-soft)', maxWidth: 600, margin: '0 auto', lineHeight: 1.75 }}>
              Chat with Tellem to find anyone — consultants, deal targets, candidates, or investors.
            </p>
          </div>
          <div className="anim-fade-up delay-2" style={{ display: 'flex', justifyContent: 'center' }}>
            <ChatInterfaceMockup />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '100px 24px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Features</div>
            <h2 className="serif" style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 600, letterSpacing: '-0.03em' }}>Built for outbound</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 12 : 20 }}>
            {features.map((f) => (
              <div key={f.title} className="card" style={{ padding: 40 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--teal-soft)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>{f.icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.75 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Testimonials</div>
            <h2 className="serif" style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 600, letterSpacing: '-0.03em' }}>Users love Tellem</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 12 : 20 }}>
            {testimonials.map((t) => (
              <div key={t.name} className="card" style={{ padding: 40 }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
                  {[...Array(5)].map((_, i) => <Star key={i} style={{ width: 14, height: 14, fill: '#fbbf24', color: '#fbbf24' }} />)}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 28 }}>"{t.quote}"</p>
                <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--teal-soft)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>{t.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{t.role}, {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '120px 24px', background: 'var(--ink)', color: 'white', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(0,168,150,0.05) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 700, margin: '0 auto' }}>
          <h2 className="serif" style={{ fontSize: 'clamp(40px, 6vw, 60px)', fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 24 }}>
            Stop cold-calling.<br />Start closing deals.
          </h2>
          <p style={{ fontSize: 17, opacity: 0.8, marginBottom: 48, lineHeight: 1.7 }}>
            Let AI handle outreach while you focus on what matters.
          </p>
          <Link to="/register" className="btn-primary" style={{ padding: '16px 32px', fontSize: 15, background: 'white', color: 'var(--ink)' }}>
            Get started free <ArrowRight style={{ width: 16, height: 16 }} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: 'var(--card)', borderTop: '1px solid var(--border)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'var(--ink)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send style={{ width: 13, height: 13, color: 'white' }} />
            </div>
            <span className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Tellem</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>© 2026 Tellem. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
