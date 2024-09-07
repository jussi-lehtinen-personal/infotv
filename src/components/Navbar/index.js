// Filename - "./components/Navbar.js

import React from "react";
import { Link } from "react-router-dom";
var moment = require('moment');

const getUpcomingWeek = (offset) => {
    var now = new Date()
    var date = new Date(now.setDate(now.getDate() + (offset * 7)));
    return moment(date).format('YYYY-MM-DD')
}

const Navbar = () => {
	return (
		<>
            <h4>Info-tv sivut</h4>
            <ul>
                <li>
                    <Link to={"/schedule"}>
                        Jäävuorokalenteri
                    </Link>
                </li>
                <li>
                    <Link to={"/this_week"}>
                        Tämän viikon ottelut
                    </Link>
                </li>
                <li>
                    <Link to={"/ads"}>
                        SoMe mainokset
                    </Link>
                </li>
            </ul>

            <h4>Tulevat ottelut</h4>
            <ul>
                <li>
                    <Link to={"/week/" + getUpcomingWeek(1)}>
                    Ottelut (+1 viikko)
                    </Link>
                </li>
                <li>
                    <Link to={"/week/" + getUpcomingWeek(2)}>
                    Ottelut (+2 viikkoa)
                    </Link>
                </li>
                <li>
                    <Link to={"/week/" + getUpcomingWeek(3)}>
                    Ottelut (+3 viikkoa)
                    </Link>
                </li>
                <li>
                    <Link to={"/week/" + getUpcomingWeek(4)}>
                    Ottelut (+4 viikkoa)
                    </Link>
                </li>
            </ul>

		</>
	);
};

export default Navbar;
