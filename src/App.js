import { Suspense, lazy } from "react";
import {
    BrowserRouter as Router,
    Routes,
    Route
} from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { muiTheme } from "./theme/muiTheme";
import './App.css';

import Home from "./pages";
import Blogs from "./pages/blogs";
import SignUp from "./pages/signup";
import Gamezone from "./pages/gamezone";
import GamezoneSchedule from "./pages/gamezone_schedule";
import BoxScore from "./pages/game";
import { GamezoneLayout } from "./components/GamezoneLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdatePrompt } from "./components/ui/UpdatePrompt";
import Ads from "./pages/ads";
import GameAds from "./pages/game_ads";
import Teams from "./pages/teams";
import Team from "./pages/team";
import News from "./pages/news";
import Organisation from "./pages/organisation";
import Feed from "./pages/feed";
import Account from "./pages/account";
import Privacy from "./pages/privacy";
import Legal from "./pages/legal";
import Settings from "./pages/settings";
import Supporters from "./pages/supporters";
import Partners from "./pages/partners";
import Report from "./pages/report";
import Authorize from "./pages/authorize";
import TrainingEnrollments from "./pages/training_enrollments";
import Stats from "./pages/stats";
import Admin from "./pages/admin";
import AdminUsers from "./pages/admin_users";
import AdminBackups from "./pages/admin_backups";
import AdminAccounts from "./pages/admin_accounts";
import InfoTvHub from "./pages/infotv";
import InfoTvOttelut from "./pages/infotv/ottelut";
import InfoTvJaavuorot from "./pages/infotv/jaavuorot";
import InfoTvKotipeli from "./pages/infotv/kotipeli";
import InfoTvAhmaliiga from "./pages/infotv/ahmaliiga";
import InfoTvTilastot from "./pages/infotv/tilastot";
import InfoTvKumppanit from "./pages/infotv/kumppanit";
import FacilityReservations from "./pages/facility_reservations";
import Ahmaliiga from "./pages/ahmaliiga";
import { AhmaliigaLayout, RequireEnvAdmin } from "./components/AhmaliigaLayout";
import LiigaHome from "./pages/liiga/home";
import LiigaMarket from "./pages/liiga/market";
import LiigaCard from "./pages/liiga/card";
import LiigaPredict from "./pages/liiga/predict";
import LiigaRanking from "./pages/liiga/ranking";
import LiigaEdit from "./pages/liiga/edit";
import LiigaRound from "./pages/liiga/round";
import LiigaAdmin from "./pages/liiga/admin";
import LiigaRewards from "./pages/liiga/rewards";
import LiigaKiosk from "./pages/liiga/kiosk";
import LiigaPromo from "./pages/liiga/promo";
import LiigaWelcome from "./pages/liiga/welcome";
import LiigaNotifications from "./pages/liiga/notifications";
import { LiigaStub } from "./pages/liiga/stub";
import { LuUser, LuAward } from "react-icons/lu";

// Lazy — the ONLY module importing bootstrap/dist/css/bootstrap.css, which bled globally
// (its `a:hover{color:#0056b3}` turned EVERY link's text blue on hover). Lazy-loading keeps
// Bootstrap out of the app for normal use; it only arrives if /schedule is actually opened.
const Schedule = lazy(() => import("./pages/schedule"));

function App() {
  return (
    <ThemeProvider theme={muiTheme}>
    <Router>
      <UpdatePrompt />
      <ErrorBoundary>
        <Suspense fallback={null}>
        <Routes>
            <Route
                path="/schedule"
                element={<Schedule />}
            />
            <Route element={<GamezoneLayout />}>
                <Route exact path="/" element={<Home />} />
                <Route
                    path="/gamezone"
                    element={<Gamezone />}
                />
                <Route
                    path="/gamezone/:timestamp"
                    element={<Gamezone />}
                />
                <Route
                    path="/gamezone/schedule"
                    element={<GamezoneSchedule />}
                />
                <Route path="/gamezone/game/:id" element={<BoxScore />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/facilities" element={<FacilityReservations />} />
                <Route path="/teams/:subsiteId" element={<Team />} />
                <Route path="/news" element={<News />} />
                <Route path="/organization" element={<Organisation />} />
                <Route path="/feed" element={<Feed />} />
                <Route path="/account" element={<Account />} />
                <Route path="/account/privacy" element={<Privacy />} />
                <Route path="/legal/:doc" element={<Legal />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/supporters" element={<Supporters />} />
                <Route path="/partners" element={<Partners />} />
                <Route
                    path="/ads"
                    element={<Ads />}
                />
                <Route
                    path="/ads/:timestamp"
                    element={<Ads />}
                />
                <Route
                    path="/ads/:timestamp/:gameId"
                    element={<GameAds />}
                />
            </Route>

            {/* Ahmaliiga (fantasy) — preview, own layout + bottom bar, gated to
                the ADMIN_USER_IDS env allowlist only (RequireEnvAdmin/Gate). */}
            <Route path="/ahmaliiga" element={<AhmaliigaLayout />}>
                <Route index element={<LiigaHome />} />
                <Route path="tervetuloa" element={<LiigaWelcome />} />
                <Route path="squad" element={<LiigaEdit />} />
                <Route path="market" element={<LiigaMarket />} />
                <Route path="card/:id" element={<LiigaCard />} />
                <Route path="predict" element={<LiigaPredict />} />
                <Route path="ranking" element={<LiigaRanking />} />
                <Route path="round" element={<LiigaRound />} />
                <Route path="timeline" element={<LiigaRound />} />
                <Route path="admin" element={<LiigaAdmin />} />
                <Route path="rewards" element={<LiigaRewards />} />
                <Route path="kiosk" element={<LiigaKiosk />} />
                <Route path="profile" element={<LiigaStub icon={LuUser} title="Profiili" desc="Fantasy-tilastosi: liittymispäivä, mestaruudet, paras ja keskimääräinen sijoitus, pelatut jaksot." />} />
                <Route path="achievements" element={<LiigaStub icon={LuAward} title="Saavutukset" desc="Ansiomerkit: ensimmäinen voitto, jakson voittaja, 100 pistettä, 10 oikeaa veikkausta." />} />
            </Route>
            <Route path="/ahmaliiga/info" element={<LiigaPromo />} />

            {/* Notifications inbox — ONE app-wide page (not gated behind Ahmaliiga).
                Opened by both the home bell and the Ahmaliiga bell. */}
            <Route path="/notifications" element={<LiigaNotifications />} />
            <Route path="/ahmaliiga/rules" element={<RequireEnvAdmin><Ahmaliiga /></RequireEnvAdmin>} />

            {/* Sign-in handover for other club apps (valmennus) — see valmennus/AUTH.md.
                Standalone, no layout: mints a code for the signed-in user and redirects back. */}
            <Route path="/authorize" element={<Authorize />} />

            <Route path="/report" element={<Report />} />
            <Route path="/coaching" element={<TrainingEnrollments />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/backups" element={<AdminBackups />} />
            <Route path="/admin/accounts" element={<AdminAccounts />} />

            {/* InfoTV signage pages (lobby TV, 1920x1080, fullscreen no-scroll).
                Self-contained set under src/pages/infotv, accessed by direct URI. */}
            <Route path="/infotv" element={<InfoTvHub />} />
            <Route path="/infotv/ottelut" element={<InfoTvOttelut />} />
            <Route path="/infotv/jaavuorot" element={<InfoTvJaavuorot />} />
            <Route path="/infotv/kotipeli" element={<InfoTvKotipeli />} />
            <Route path="/infotv/ahmaliiga" element={<InfoTvAhmaliiga />} />
            <Route path="/infotv/tilastot" element={<InfoTvTilastot />} />
            <Route path="/infotv/kumppanit" element={<InfoTvKumppanit />} />
            <Route path="/blogs" element={<Blogs />} />
            <Route
                path="/sign-up"
                element={<SignUp />}
            />
        </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
    </ThemeProvider>
  );
}

export default App;
