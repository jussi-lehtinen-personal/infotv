import {
    BrowserRouter as Router,
    Routes,
    Route
} from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { muiTheme } from "./theme/muiTheme";
import './App.css';

import Home from "./pages";
import Schedule from "./pages/schedule";
import Blogs from "./pages/blogs";
import SignUp from "./pages/signup";
import ThisWeek from "./pages/this_week";
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
import Stats from "./pages/stats";
import Admin from "./pages/admin";
import AdminUsers from "./pages/admin_users";
import AdminBackups from "./pages/admin_backups";
import NextHomeGame from "./pages/next_home_game";
import FacilityReservations from "./pages/facility_reservations";
import Ahmaliiga from "./pages/ahmaliiga";
import { AhmaliigaLayout, RequireEnvAdmin } from "./components/AhmaliigaLayout";
import LiigaHome from "./pages/liiga/home";
import LiigaMarket from "./pages/liiga/market";
import LiigaPredict from "./pages/liiga/predict";
import LiigaRanking from "./pages/liiga/ranking";
import LiigaEdit from "./pages/liiga/edit";
import LiigaSummary from "./pages/liiga/summary";
import LiigaAdmin from "./pages/liiga/admin";
import { LiigaStub } from "./pages/liiga/stub";
import { LuLayoutGrid, LuUser, LuAward, LuBell } from "react-icons/lu";

function App() {
  return (
    <ThemeProvider theme={muiTheme}>
    <Router>
      <UpdatePrompt />
      <ErrorBoundary>
        <Routes>
            <Route
                path="/schedule"
                element={<Schedule />}
            />
            <Route
                path="/this_week"
                element={<ThisWeek />}
            />
            <Route
                path="/week/:timestamp"
                element={<ThisWeek />}
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
                <Route path="joukkue" element={<LiigaEdit />} />
                <Route path="markkina" element={<LiigaMarket />} />
                <Route path="kortti/:id" element={<LiigaStub icon={LuLayoutGrid} title="Kortin tiedot" desc="Kuva, pistehistoria, tulevat pelit, hintakehitys ja viimeisimmät tulokset." />} />
                <Route path="veikkaus" element={<LiigaPredict />} />
                <Route path="ranking" element={<LiigaRanking />} />
                <Route path="jakso" element={<LiigaSummary />} />
                <Route path="admin" element={<LiigaAdmin />} />
                <Route path="profiili" element={<LiigaStub icon={LuUser} title="Profiili" desc="Fantasy-tilastosi: liittymispäivä, mestaruudet, paras ja keskimääräinen sijoitus, pelatut jaksot." />} />
                <Route path="saavutukset" element={<LiigaStub icon={LuAward} title="Saavutukset" desc="Ansiomerkit: ensimmäinen voitto, jakson voittaja, 100 pistettä, 10 oikeaa veikkausta." />} />
                <Route path="ilmoitukset" element={<LiigaStub icon={LuBell} title="Ilmoitukset" desc="Fantasy-notifikaatiot: kapteenisi teki maalin, joukkueesi voitti, veikkauksesi osui." />} />
            </Route>
            <Route path="/ahmaliiga/saannot" element={<RequireEnvAdmin><Ahmaliiga /></RequireEnvAdmin>} />

            <Route path="/report" element={<Report />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/backups" element={<AdminBackups />} />
            <Route path="/next_home_game" element={<NextHomeGame />} />
            <Route path="/blogs" element={<Blogs />} />
            <Route
                path="/sign-up"
                element={<SignUp />}
            />
        </Routes>
      </ErrorBoundary>
    </Router>
    </ThemeProvider>
  );
}

export default App;
