import {
    BrowserRouter as Router,
    Routes,
    Route,
} from "react-router-dom";
import './App.css';
import Home from "./pages";
import Schedule from "./pages/schedule";
import Blogs from "./pages/blogs";
import SignUp from "./pages/signup";
import Contact from "./pages/contact";

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
                path="/contact"
                element={<Contact />}
            />
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
