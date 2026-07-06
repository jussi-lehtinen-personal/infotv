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
