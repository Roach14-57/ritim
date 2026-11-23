import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './social.css';
import './social-controls.css';

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
const SPOTIFY_REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim() || window.location.origin;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim()?.replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const SHARED_MODE = Boolean(SUPABASE_URL && SUPABASE_KEY);
const initialSearch = 'turkish indie';
let sessionRefreshPromise = null;

const seedReviews = [
  { id: 'demo-1', author_id: 'demo-ada', author_name: 'Ada Y.', spotify_id: '4Z8W4fKeB5YxbusRsdQVPb', item_type: 'album', title: 'Darmaduman', artist: 'Duman', image_url: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=600&q=80', spotify_url: 'https://open.spotify.com/search/Darmaduman%20Duman', rating: 9, body: 'Her dinleyişte başka bir yere dokunuyor. Baştan sona gece yürüyüşü gibi; özellikle albümün ikinci yarısı bende ayrı bir yerde.', created_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(), comments: [{ id: 'c1', author_name: 'Mert K.', body: 'Aynı hissi ben de alıyorum, hiç eskimiyor.', created_at: new Date(Date.now() - 1000 * 60 * 16).toISOString() }], liked_by_me: false, like_count: 28 },
  { id: 'demo-2', author_id: 'demo-mert', author_name: 'Mert K.', spotify_id: '3e9HZxeyfWwjeyPAMmWSSQ', item_type: 'track', title: 'Bir Derdim Var', artist: 'Mor ve Ötesi', image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80', spotify_url: 'https://open.spotify.com/search/Bir%20Derdim%20Var%20Mor%20ve%20%C3%96tesi', rating: 10, body: 'Bazı şarkılar zamana değil, insana ait. İlk notadan itibaren hâlâ tüyler diken diken.', created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), comments: [{ id: 'c2', author_name: 'Ece D.', body: 'Canlı versiyonu da bambaşka güzel.', created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString() }], liked_by_me: false, like_count: 41 },
  { id: 'demo-3', author_id: 'demo-ece', author_name: 'Ece D.', spotify_id: '5bYma4eT2lKsv6p7jYx9n4', item_type: 'album', title: 'Yüzyüzeyken Konuşuruz', artist: 'Yüzyüzeyken Konuşuruz', image_url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=600&q=80', spotify_url: 'https://open.spotify.com/search/Y%C3%BCzy%C3%BCzeyken%20Konu%C5%9Furuz', rating: 8, body: 'Şehrin sesi kısılınca açtığım albüm. Sözleriyle değil sadece, aralardaki sessizlikle de konuşuyor.', created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), comments: [], liked_by_me: false, like_count: 16 },
];
const demoCatalog = seedReviews.map((review) => ({ id: review.spotify_id, type: review.item_type, kind: review.item_type === 'album' ? 'Albüm' : 'Şarkı', title: review.title, artist: review.artist, image: review.image_url, url: review.spotify_url, album: review.title }));

function readJson(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => chars[value % chars.length]).join('');
}

async function createCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function initials(name = 'Ritim üyesi') {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('tr-TR')).join('') || 'R';
}

function timeAgo(date) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

async function supabaseRequest(path, { method = 'GET', body, session = null, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 204) return null;
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || data?.hint || 'Topluluk servisine ulaşılamadı.');
  return data;
}

async function authRequest(path, body, key) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'Hesap işlemi tamamlanamadı.');
  return data;
}

function refreshCommunitySession(session) {
  if (!session?.refresh_token) return Promise.resolve(null);
  if (!sessionRefreshPromise) {
    sessionRefreshPromise = authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token }, SUPABASE_KEY)
      .then(normalizeSession)
      .finally(() => { sessionRefreshPromise = null; });
  }
  return sessionRefreshPromise;
}

function normalizeSession(data) {
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000, user: data.user };
}

function App() {
  const [reviews, setReviews] = useState(() => readJson('ritim-demo-reviews', seedReviews));
  const [session, setSession] = useState(() => readJson('ritim-community-session', null));
  const [initialized, setInitialized] = useState(false);
  const [tab, setTab] = useState('Akış');
  const [sort, setSort] = useState('Yeni');
  const [filter, setFilter] = useState('Hepsi');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [catalogSource, setCatalogSource] = useState('spotify');
  const [searchLoading, setSearchLoading] = useState(false);
  const [spotifyToken, setSpotifyToken] = useState(() => {
    const token = localStorage.getItem('ritim-spotify-token');
    return Number(localStorage.getItem('ritim-spotify-expires')) > Date.now() ? token || '' : '';
  });
  const [selectedItem, setSelectedItem] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reviewBody, setReviewBody] = useState('');
  const [rating, setRating] = useState(8);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accountName, setAccountName] = useState(() => localStorage.getItem('ritim-demo-name') || 'Müziksever');
  const [profileOpen, setProfileOpen] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [savedIds, setSavedIds] = useState(() => readJson('ritim-saved', []));
  const [notice, setNotice] = useState('');
  const callbackHandled = useRef(false);
  const searchRef = useRef(null);

  const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || accountName;
  const remoteConfigured = SHARED_MODE;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const authError = params.get('error');
    const cleanUrl = () => window.history.replaceState({}, document.title, window.location.pathname);
    if (authError) { setNotice('Spotify bağlantısı iptal edildi. Dilersen yeniden dene.'); cleanUrl(); return; }
    if (!code || callbackHandled.current) return;
    callbackHandled.current = true;
    const expectedState = localStorage.getItem('ritim-spotify-state');
    const verifier = localStorage.getItem('ritim-spotify-verifier');
    if (!SPOTIFY_CLIENT_ID || !verifier || !expectedState || returnedState !== expectedState) {
      setNotice('Spotify bağlantı doğrulaması tamamlanamadı. Yeniden bağlanmayı dene.'); cleanUrl(); return;
    }
    fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT_URI, code_verifier: verifier }) })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(); localStorage.setItem('ritim-spotify-token', data.access_token); localStorage.setItem('ritim-spotify-expires', String(Date.now() + data.expires_in * 1000)); setSpotifyToken(data.access_token); setNotice('Spotify kataloğu bağlandı. Şimdi bir albüm ya da şarkı ara.'); })
      .catch(() => setNotice('Spotify bağlantısı kurulamadı. Ayarları kontrol edip yeniden dene.'))
      .finally(() => { localStorage.removeItem('ritim-spotify-state'); localStorage.removeItem('ritim-spotify-verifier'); cleanUrl(); });
  }, []);

  const loadRemoteFeed = async (activeSession = session) => {
    const [rows, comments, likes] = await Promise.all([
      supabaseRequest('reviews?select=*&order=created_at.desc&limit=60', { session: activeSession }),
      supabaseRequest('comments?select=*&order=created_at.asc&limit=300', { session: activeSession }),
      supabaseRequest('review_likes?select=review_id,user_id&limit=1000', { session: activeSession }),
    ]);
    const userId = activeSession?.user?.id;
    const hydrated = rows.map((row) => {
      const itemLikes = likes.filter((like) => String(like.review_id) === String(row.id));
      return { ...row, comments: comments.filter((comment) => String(comment.review_id) === String(row.id)), like_count: itemLikes.length, liked_by_me: Boolean(userId && itemLikes.some((like) => like.user_id === userId)) };
    });
    setReviews(hydrated);
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!remoteConfigured) { setInitialized(true); return; }
      let currentSession = session;
      if (currentSession?.refresh_token && currentSession.expires_at < Date.now() + 30000) {
        try {
          const refreshed = await refreshCommunitySession(currentSession);
          currentSession = refreshed; localStorage.setItem('ritim-community-session', JSON.stringify(refreshed));
          if (active) setSession(refreshed);
        } catch { currentSession = null; localStorage.removeItem('ritim-community-session'); if (active) setSession(null); }
      }
      if (active) setReviews([]);
      try { await loadRemoteFeed(currentSession); }
      catch (error) { if (active) setNotice(`Topluluk verisi yüklenemedi: ${error.message}`); }
      if (active) setInitialized(true);
    };
    initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => { if (!remoteConfigured && initialized) localStorage.setItem('ritim-demo-reviews', JSON.stringify(reviews)); }, [reviews, initialized, remoteConfigured]);
  useEffect(() => { localStorage.setItem('ritim-saved', JSON.stringify(savedIds)); }, [savedIds]);
  useEffect(() => {
    if (!remoteConfigured || !initialized) return undefined;
    const timer = window.setInterval(() => loadRemoteFeed(session).catch(() => {}), 30000);
    return () => window.clearInterval(timer);
  }, [remoteConfigured, initialized, session]);

  const connectSpotify = async () => {
    if (!SPOTIFY_CLIENT_ID) { setNotice('Spotify araması için VITE_SPOTIFY_CLIENT_ID ayarla. Kurulum README’de.'); return; }
    const verifier = randomString(); const state = randomString(24);
    localStorage.setItem('ritim-spotify-verifier', verifier); localStorage.setItem('ritim-spotify-state', state);
    const challenge = await createCodeChallenge(verifier);
    const params = new URLSearchParams({ response_type: 'code', client_id: SPOTIFY_CLIENT_ID, redirect_uri: SPOTIFY_REDIRECT_URI, code_challenge_method: 'S256', code_challenge: challenge, state });
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  };

  const searchSpotify = async (event) => {
    event?.preventDefault();
    if (!searchText.trim()) { searchRef.current?.focus(); return; }
    if (!SPOTIFY_CLIENT_ID) {
      if (!remoteConfigured) {
        const query = searchText.trim().toLocaleLowerCase('tr-TR');
        setCatalogSource('demo');
        setSearchResults(demoCatalog.filter((item) => `${item.title} ${item.artist}`.toLocaleLowerCase('tr-TR').includes(query)));
        setNotice('Örnek katalog açık. Spotify kataloğunda arama için Client ID’ni README’den ekleyebilirsin.');
      } else setNotice('Spotify araması için README’deki adımlarla Client ID’ni ekle.');
      return;
    }
    if (!spotifyToken) { connectSpotify(); return; }
    setSearchLoading(true); setNotice('');
    try {
      const params = new URLSearchParams({ q: searchText.trim(), type: 'track,album', limit: '10', market: 'TR' });
      const response = await fetch(`https://api.spotify.com/v1/search?${params}`, { headers: { Authorization: `Bearer ${spotifyToken}` } });
      if (response.status === 401) { localStorage.removeItem('ritim-spotify-token'); localStorage.removeItem('ritim-spotify-expires'); setSpotifyToken(''); throw new Error('Spotify oturumu bitti. Tekrar bağlan.'); }
      if (response.status === 429) throw new Error('Spotify aramaları yoğun. Biraz sonra tekrar dene.');
      if (!response.ok) throw new Error('Spotify araması başarısız oldu.');
      const data = await response.json();
      const tracks = (data.tracks?.items || []).map((track) => ({ id: track.id, type: 'track', kind: 'Şarkı', title: track.name, artist: track.artists.map((artist) => artist.name).join(', '), image: track.album.images?.[1]?.url || track.album.images?.[0]?.url || '', url: track.external_urls.spotify, album: track.album.name }));
      const albums = (data.albums?.items || []).map((album) => ({ id: album.id, type: 'album', kind: 'Albüm', title: album.name, artist: album.artists.map((artist) => artist.name).join(', '), image: album.images?.[1]?.url || album.images?.[0]?.url || '', url: album.external_urls.spotify, album: album.name }));
      setCatalogSource('spotify');
      setSearchResults([...albums, ...tracks]);
      if (!albums.length && !tracks.length) setNotice('Spotify’da eşleşme bulamadık; başka bir arama dene.');
    } catch (error) { setNotice(error.message || 'Spotify’a ulaşılamadı.'); setSearchResults([]); }
    finally { setSearchLoading(false); }
  };

  const pickItem = (item) => {
    setSelectedItem(item); setRating(8); setReviewBody(''); setSearchResults([]);
    if (remoteConfigured && !session) { setAuthMode('login'); setAuthMessage('Paylaşmak için topluluk hesabınla giriş yap.'); setAuthOpen(true); return; }
    setComposerOpen(true);
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!selectedItem) return;
    if (remoteConfigured && !session) { setComposerOpen(false); setAuthOpen(true); return; }
    setBusy(true);
    const record = { author_id: session?.user?.id || 'local-user', author_name: displayName, spotify_id: selectedItem.id, item_type: selectedItem.type, title: selectedItem.title, artist: selectedItem.artist, image_url: selectedItem.image, spotify_url: selectedItem.url, rating, body: reviewBody.trim() };
    try {
      if (remoteConfigured) {
        const [created] = await supabaseRequest('reviews', { method: 'POST', body: record, session, prefer: 'return=representation' });
        setReviews((current) => [{ ...created, comments: [], like_count: 0, liked_by_me: false }, ...current]);
      } else {
        setReviews((current) => [{ ...record, id: `local-${Date.now()}`, created_at: new Date().toISOString(), comments: [], like_count: 0, liked_by_me: false }, ...current]);
      }
      setComposerOpen(false); setSelectedItem(null); setReviewBody(''); setTab('Akış'); setNotice('Yorumun akışta paylaşıldı.');
    } catch (error) { setNotice(`Paylaşım gönderilemedi: ${error.message}`); }
    finally { setBusy(false); }
  };

  const toggleLike = async (review) => {
    if (remoteConfigured && !session) { setAuthMessage('Beğeni bırakmak için giriş yap.'); setAuthOpen(true); return; }
    const wasLiked = review.liked_by_me;
    if (!remoteConfigured) {
      setReviews((current) => current.map((item) => item.id === review.id ? { ...item, liked_by_me: !wasLiked, like_count: Math.max(0, (item.like_count || 0) + (wasLiked ? -1 : 1)) } : item)); return;
    }
    setReviews((current) => current.map((item) => item.id === review.id ? { ...item, liked_by_me: !wasLiked, like_count: Math.max(0, item.like_count + (wasLiked ? -1 : 1)) } : item));
    try {
      if (wasLiked) await supabaseRequest(`review_likes?review_id=eq.${review.id}&user_id=eq.${session.user.id}`, { method: 'DELETE', session });
      else await supabaseRequest('review_likes', { method: 'POST', body: { review_id: review.id, user_id: session.user.id }, session, prefer: 'return=minimal' });
    } catch (error) { setNotice(`Beğeni kaydedilemedi: ${error.message}`); try { await loadRemoteFeed(session); } catch {} }
  };

  const sendComment = async (review) => {
    const body = (commentDrafts[review.id] || '').trim(); if (!body) return;
    if (remoteConfigured && !session) { setAuthMessage('Yorum yazmak için topluluk hesabınla giriş yap.'); setAuthOpen(true); return; }
    const comment = { author_id: session?.user?.id || 'local-user', author_name: displayName, body, review_id: review.id };
    try {
      let created;
      if (remoteConfigured) [created] = await supabaseRequest('comments', { method: 'POST', body: comment, session, prefer: 'return=representation' });
      else created = { ...comment, id: `comment-${Date.now()}`, created_at: new Date().toISOString() };
      setReviews((current) => current.map((item) => item.id === review.id ? { ...item, comments: [...(item.comments || []), created] } : item));
      setCommentDrafts((current) => ({ ...current, [review.id]: '' })); setExpandedComments((current) => ({ ...current, [review.id]: true }));
    } catch (error) { setNotice(`Yorum gönderilemedi: ${error.message}`); }
  };

  const saveSession = (data) => {
    const next = normalizeSession(data); localStorage.setItem('ritim-community-session', JSON.stringify(next)); setSession(next); setAuthOpen(false); setAuthMessage(''); setAuthError(''); setNotice('Topluluk hesabına bağlandın.');
    if (remoteConfigured) loadRemoteFeed(next).catch((error) => setNotice(`Akış yüklenemedi: ${error.message}`));
    if (selectedItem) setComposerOpen(true);
  };

  const handleAuth = async (event) => {
    event.preventDefault(); setBusy(true); setAuthError('');
    const form = new FormData(event.currentTarget); const email = form.get('email'); const password = form.get('password');
    const name = form.get('display_name');
    try {
      if (!remoteConfigured) throw new Error('Paylaşımlı hesap için Supabase ayarlarını tamamla.');
      if (authMode === 'signup') {
        const data = await authRequest('signup', { email, password, data: { display_name: name } }, SUPABASE_KEY);
        if (data.access_token) saveSession(data);
        else { setAuthMessage('Hesap oluşturuldu. Giriş yapmadan önce e-posta adresini doğrula.'); setAuthMode('login'); }
      } else {
        const data = await authRequest('token?grant_type=password', { email, password }, SUPABASE_KEY);
        saveSession(data);
      }
    } catch (error) { setAuthError(error.message); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    if (remoteConfigured && session) {
      try { await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` } }); } catch {}
    }
    localStorage.removeItem('ritim-community-session'); setSession(null); setProfileOpen(false);
    if (remoteConfigured) loadRemoteFeed(null).catch(() => {});
  };

  const toggleSaved = (id) => setSavedIds((current) => current.includes(id) ? current.filter((saved) => saved !== id) : [...current, id]);
  const shareReview = async (review) => {
    const url = `${window.location.origin}${window.location.pathname}#review-${review.id}`;
    try { await navigator.clipboard.writeText(url); setNotice('Yorum bağlantısı panoya kopyalandı.'); }
    catch { setNotice(`Yorum bağlantısı: ${url}`); }
  };
  const visibleReviews = useMemo(() => {
    let result = [...reviews];
    if (tab === 'Kaydedilenler') result = result.filter((review) => savedIds.includes(review.id));
    if (tab === 'Keşfet') result = result.filter((review) => review.like_count >= 10);
    if (filter !== 'Hepsi') result = result.filter((review) => review.item_type === (filter === 'Albümler' ? 'album' : 'track'));
    if (sort === 'Popüler') result.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    return result;
  }, [reviews, tab, savedIds, filter, sort]);
  const allComments = reviews.reduce((sum, review) => sum + (review.comments?.length || 0), 0);

  return (
    <div className="social-app">
      <aside className="social-sidebar">
        <a className="social-brand" href="#top"><span className="social-brand-icon">r</span>ritim<span className="brand-period">.</span></a>
        <div className="sidebar-kicker">MÜZİK, BİZİ BULUŞTURUR</div>
        <nav className="social-nav" aria-label="Topluluk menüsü">
          {[['Akış', '◫'], ['Keşfet', '⌕'], ['Kaydedilenler', '♧']].map(([label, symbol]) => <button key={label} className={tab === label ? 'active' : ''} onClick={() => setTab(label)}><span className="nav-symbol">{symbol}</span>{label}{label === 'Kaydedilenler' && savedIds.length > 0 && <span className="nav-badge">{savedIds.length}</span>}</button>)}
        </nav>
        <div className="sidebar-rule"/>
        <div className="sidebar-section-title">TOPLULUK</div>
        <div className="community-stat"><span className="stat-icon">♫</span><div><strong>{reviews.length.toLocaleString('tr-TR')}</strong><small>müzik yorumu</small></div></div>
        <div className="community-stat"><span className="stat-icon">↗</span><div><strong>{allComments.toLocaleString('tr-TR')}</strong><small>sohbet</small></div></div>
        <div className="sidebar-spacer"/>
        <div className={`mode-card ${remoteConfigured ? 'mode-online' : ''}`}><span className="mode-dot"/><div><strong>{remoteConfigured ? 'Topluluk modu' : 'Demo modu'}</strong><small>{remoteConfigured ? 'Paylaşımlar herkese açık' : 'Bu tarayıcıda saklanır'}</small></div></div>
        <button className="profile-button" onClick={() => session || !remoteConfigured ? setProfileOpen(true) : setAuthOpen(true)}><span className="avatar">{initials(displayName)}</span><span className="profile-name"><strong>{displayName}</strong><small>{session ? 'Topluluk üyesi' : 'Yerel profil'}</small></span><span className="profile-more">···</span></button>
      </aside>

      <main className="social-main" id="top">
        <header className="social-topbar"><div className="mobile-brand"><span className="social-brand-icon">r</span>ritim<span className="brand-period">.</span></div><form className="catalog-search" onSubmit={searchSpotify}><span className="search-icon">⌕</span><input ref={searchRef} value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Spotify’da albüm veya şarkı ara..." aria-label="Spotify kataloğunda ara"/><button type="submit" disabled={searchLoading}>{searchLoading ? 'Aranıyor…' : 'Ara'}</button></form><button className="top-profile" onClick={() => session || !remoteConfigured ? setProfileOpen(true) : setAuthOpen(true)} aria-label="Profil"><span className="avatar">{initials(displayName)}</span></button></header>

        <div className="social-layout">
          <section className="feed-column" aria-labelledby="feed-title">
            <div className="welcome-strip"><div><span className="welcome-eyebrow">KULAKLIKLA DAHA GÜZEL</span><h1 id="feed-title">Müzik hakkında<br/><em>konuşalım.</em></h1><p>Dinle. Hisset. Paylaş.</p></div><div className="welcome-art" aria-hidden="true"><span>♫</span><i/><b/><small>SIDE A&nbsp; / &nbsp;SIDE B</small></div></div>

            {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Bildirimi kapat">×</button></div>}

            {searchResults.length > 0 && <section className="search-results" aria-label="Müzik arama sonuçları"><div className="subsection-heading"><div><span className="section-overline">{catalogSource === 'spotify' ? 'SPOTIFY KATALOĞU' : 'ÖRNEK KATALOG'}</span><h2>Hangisi sende bir şey uyandırdı?</h2></div><button className="text-button" onClick={() => setSearchResults([])}>Kapat</button></div><div className="catalog-grid">{searchResults.map((item) => <article key={`${item.type}-${item.id}`} className="catalog-card"><button className="catalog-select" onClick={() => pickItem(item)}><img src={item.image} alt="" loading="lazy"/><span className="catalog-meta"><small>{item.kind}</small><strong>{item.title}</strong><em>{item.artist}</em></span><span className="catalog-plus">＋</span></button></article>)}</div></section>}

            <div className="composer-prompt"><span className="avatar">{initials(displayName)}</span><button onClick={() => { if (searchText.trim()) searchSpotify(); else searchRef.current?.focus(); }}>Aklında hangi albüm ya da şarkı var?</button><button className="prompt-cta" onClick={() => searchRef.current?.focus()}>+ Yorum yaz</button></div>

            <div className="feed-heading"><div><span className="section-overline">BİZİM PLAKLIK</span><h2>{tab === 'Akış' ? 'Topluluktan' : tab}</h2></div><div className="feed-tools"><div className="filter-tabs">{['Hepsi', 'Albümler', 'Şarkılar'].map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><label className="sort-select"><span className="visually-hidden">Akışı sırala</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Yeni</option><option>Popüler</option></select></label><button className="refresh-feed" title="Akışı yenile" aria-label="Akışı yenile" onClick={() => remoteConfigured ? loadRemoteFeed(session).catch((error) => setNotice(error.message)) : setReviews(readJson('ritim-demo-reviews', seedReviews))}>↻</button></div></div>

            {!initialized && <div className="feed-loading"><span className="loading-pulse"/> Akış hazırlanıyor…</div>}
            {initialized && visibleReviews.length === 0 && <div className="empty-feed"><span>♫</span><h3>{tab === 'Kaydedilenler' ? 'Henüz kaydettiğin bir yorum yok.' : 'İlk yorumu sen bırak.'}</h3><p>Spotify’da bir şarkı ya da albüm bul, kaç puan verdiğini ve sende ne uyandırdığını toplulukla paylaş.</p><button onClick={() => searchRef.current?.focus()}>Spotify’da müzik ara</button></div>}
            <div className="review-feed">
              {visibleReviews.map((review, index) => <article id={`review-${review.id}`} className="review-card" key={review.id}>
                <div className="review-author"><span className={`avatar avatar-${index % 4}`}>{initials(review.author_name)}</span><div className="author-copy"><strong>{review.author_name || 'Müziksever'}</strong><span>@{(review.author_name || 'müziksever').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, '')} <i>·</i> {timeAgo(review.created_at)}</span></div><button className="more-button" aria-label="Daha fazla seçenek">···</button></div>
                <div className="review-content"><div className="record-card"><img src={review.image_url} alt={`${review.title} kapak görseli`} loading="lazy"/><div className="record-details"><span className="record-type">{review.item_type === 'album' ? 'ALBÜM' : 'ŞARKI'} YORUMU</span><strong>{review.title}</strong><span>{review.artist}</span><a href={review.spotify_url} target="_blank" rel="noreferrer">Spotify’da bul ↗</a></div><div className="score-bubble"><strong>{review.rating}</strong><span>/10</span></div></div><div className="rating-row" aria-label={`${review.rating} üzerinden 10 puan`}><span className="rating-stars">{'★'.repeat(Math.round(review.rating / 2))}<i>{'★'.repeat(5 - Math.round(review.rating / 2))}</i></span><strong>{review.rating}<small>/10</small></strong></div><p className="review-body">{review.body}</p></div>
                <div className="review-actions"><button className={review.liked_by_me ? 'liked' : ''} onClick={() => toggleLike(review)} aria-pressed={review.liked_by_me}><span>♡</span> {review.like_count || 0} <small>Beğen</small></button><button onClick={() => setExpandedComments((current) => ({ ...current, [review.id]: !current[review.id] }))}><span>◌</span> {review.comments?.length || 0} <small>Yorum</small></button><button className={savedIds.includes(review.id) ? 'saved' : ''} onClick={() => toggleSaved(review.id)}><span>♧</span><small>{savedIds.includes(review.id) ? 'Kaydedildi' : 'Kaydet'}</small></button><button className="share-action" onClick={() => shareReview(review)}><span>↗</span><small>Paylaş</small></button></div>
                {expandedComments[review.id] && <div className="comments-panel"><div className="comment-list">{(review.comments || []).map((comment) => <div className="comment-row" key={comment.id}><span className="avatar avatar-small">{initials(comment.author_name)}</span><p><strong>{comment.author_name}</strong> {comment.body}<time>{timeAgo(comment.created_at)}</time></p></div>)}{!review.comments?.length && <p className="no-comments">İlk yorumu sen yaz.</p>}</div><form className="comment-form" onSubmit={(event) => { event.preventDefault(); sendComment(review); }}><span className="avatar avatar-small">{initials(displayName)}</span><input aria-label="Yorum yaz" placeholder="Sohbete katıl..." maxLength={500} value={commentDrafts[review.id] || ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [review.id]: event.target.value }))}/><button disabled={!(commentDrafts[review.id] || '').trim()}>Gönder</button></form></div>}
              </article>)}
            </div>
            <footer className="social-footer">Ritim · Müziğin etrafında buluşalım <span>Spotify Web API ile çalışır</span></footer>
          </section>

          <aside className="right-rail" aria-label="Topluluk bilgileri">
            <section className="rail-card weekly-card"><span className="section-overline">BU HAFTA</span><h3>Çok konuşulanlar</h3>{[...reviews].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 3).map((review, i) => <button className="trending-row" key={review.id} onClick={() => document.getElementById(`review-${review.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><span className="trend-number">0{i + 1}</span><img src={review.image_url} alt=""/><span><strong>{review.title}</strong><small>{review.artist}</small></span><b>{review.like_count || 0}<small> ♥</small></b></button>)}</section>
            <section className="rail-card prompt-card"><span className="prompt-spark">✳</span><span className="section-overline">KÜÇÜK BİR HATIRLATMA</span><h3>En güzel albüm,<br/>hakkında <em>konuştuğun.</em></h3><p>Bir şarkı bırak, bir sohbet başlat.</p><button onClick={() => searchRef.current?.focus()}>Müzik bul <span>↗</span></button></section>
            <section className="rail-card community-card"><span className="community-orb">♫</span><div><strong>{reviews.length}+</strong><span>dinleyici notu</span></div><div><strong>{allComments}+</strong><span>sohbet başladı</span></div><small>{remoteConfigured ? 'Gerçek zamanlı topluluk' : 'Demo içerikleri · Bu cihazda çalışır'}</small></section>
            <div className="rail-legal"><a href="https://developer.spotify.com/documentation/web-api" target="_blank" rel="noreferrer">Spotify API</a><span>·</span><a href="https://www.spotify.com/legal/" target="_blank" rel="noreferrer">Spotify şartları</a><span>·</span><span>© 2026 Ritim</span></div>
          </aside>
        </div>
      </main>

      {composerOpen && selectedItem && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false); }}><section className="modal-card compose-modal" role="dialog" aria-modal="true" aria-labelledby="compose-title"><button className="modal-close" onClick={() => setComposerOpen(false)} aria-label="Kapat">×</button><span className="section-overline">KAPAĞI ÇEVİR, FİKRİNİ SÖYLE</span><h2 id="compose-title">Sen kaç <em>puan</em> verdin?</h2><div className="selected-record"><img src={selectedItem.image} alt=""/><div><small>{selectedItem.kind} · {selectedItem.artist}</small><strong>{selectedItem.title}</strong></div><a href={selectedItem.url} target="_blank" rel="noreferrer" aria-label="Spotify'da aç">↗</a></div><form onSubmit={submitReview}><label className="rating-input-label">Puanın <strong>{rating}<small>/10</small></strong></label><input className="rating-slider" type="range" min="1" max="10" value={rating} onChange={(event) => setRating(Number(event.target.value))} aria-label="1 ile 10 arasında puan ver"/><div className="rating-scale"><span>Olmadı</span><span>Başyapıt</span></div><label className="body-label" htmlFor="review-body">Yorumun <span>İçinden geldiği gibi</span></label><textarea id="review-body" value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} placeholder="Bu şarkı ya da albüm sende ne uyandırıyor?" maxLength={500} rows={5}/><div className="compose-bottom"><span>{reviewBody.length}/500</span><button disabled={busy || !reviewBody.trim()}>{busy ? 'Paylaşılıyor…' : 'Yorumu paylaş'} <span>↗</span></button></div></form></section></div>}

      {authOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setAuthOpen(false); setAuthError(''); } }}><section className="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Kapat">×</button><span className="auth-mark">r.</span><span className="section-overline">RİTİM TOPLULUĞU</span><h2 id="auth-title">{authMode === 'signup' ? 'Aramıza katıl.' : 'Yeniden merhaba.'}</h2><p>{remoteConfigured ? 'Yorumların ve sohbetin diğer dinleyicilerle paylaşılsın.' : 'Topluluk hesabı için Supabase ayarları gerekiyor.'}</p>{!remoteConfigured ? <div className="setup-note">Demo modundasın. Paylaşımlı hesap ve ortak akış için Supabase bağlantı bilgilerini `.env` dosyasına ekle.</div> : <form onSubmit={handleAuth}>{authMode === 'signup' && <label>Görünen ad<input name="display_name" required minLength="2" maxLength="28" placeholder="Örn. Deniz"/></label>}<label>E-posta<input type="email" name="email" required placeholder="sen@ornek.com" autoComplete="email"/></label><label>Şifre<input type="password" name="password" required minLength="6" placeholder="En az 6 karakter" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}/></label>{authError && <div className="auth-error" role="alert">{authError}</div>}{authMessage && <div className="auth-message" role="status">{authMessage}</div>}<button className="auth-submit" disabled={busy}>{busy ? 'Bekle…' : authMode === 'signup' ? 'Hesap oluştur' : 'Giriş yap'} <span>↗</span></button></form>}{remoteConfigured && <button className="auth-switch" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); setAuthMessage(''); }}>{authMode === 'signup' ? 'Zaten hesabın var mı? Giriş yap' : 'Yeni misin? Hesap oluştur'}</button>}</section></div>}

      {profileOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}><section className="modal-card profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><button className="modal-close" onClick={() => setProfileOpen(false)} aria-label="Kapat">×</button>{session ? <><span className="section-overline">RİTİM TOPLULUĞU</span><h2 id="profile-title">{displayName}</h2><p>{session.user?.email}</p><button className="auth-submit" onClick={signOut}>Çıkış yap</button></> : <><span className="section-overline">YEREL PROFİL</span><h2 id="profile-title">Seni nasıl çağıralım?</h2><p>Demo modunda yazdığın içerikler bu tarayıcıda kalır.</p><form onSubmit={(event) => { event.preventDefault(); const nextName = new FormData(event.currentTarget).get('name').trim(); setAccountName(nextName || 'Müziksever'); localStorage.setItem('ritim-demo-name', nextName || 'Müziksever'); setProfileOpen(false); }}><label>Görünen ad<input name="name" defaultValue={accountName} maxLength="28"/></label><button className="auth-submit">Kaydet</button></form>{remoteConfigured && <button className="auth-switch" onClick={() => { setProfileOpen(false); setAuthOpen(true); }}>Topluluk hesabına giriş yap</button>}</>}</section></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
