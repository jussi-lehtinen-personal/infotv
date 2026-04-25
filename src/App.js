import {
    BrowserRouter as Router,
    Routes,
    Route
} from "react-router-dom";
import './App.css';

import Home from "./pages";
import Schedule from "./pages/schedule";
import Blogs from "./pages/blogs";
import SignUp from "./pages/signup";
import ThisWeek from "./pages/this_week";
import Gamezone from "./pages/gamezone";
import Ads from "./pages/ads";
import GameAds from "./pages/game_ads";
import Teams from "./pages/teams";
import NextHomeGame from "./pages/next_home_game";

function App() {
  return (
    <Router>
        <Routes>
            <Route exact path="/" element={<Home />} />
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
            <Route
                path="/gamezone"
                element={<Gamezone />}
            />
            <Route
                path="/gamezone/:timestamp"
                element={<Gamezone />}
            />
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

            <Route path="/next_home_game" element={<NextHomeGame />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/blogs" element={<Blogs />} />
            <Route
                path="/sign-up"
                element={<SignUp />}
            />
        </Routes>
    </Router>
  );
}

export default App;
