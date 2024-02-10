// Filename - "./components/Navbar.js

import React from "react";
import { Link } from "react-router-dom";

const Navbar = () => {
	return (
		<>
            <h2>Info-TV</h2>
            <ul>
                <li>
                    <Link to={"/schedule"}>
                        Jäävuorokalenteri
                    </Link>
                </li>
                <li>
                    <Link to={"/this_week"}>
                        Tulevat ottelut
                    </Link>
                </li>
                <li>
                    <Link to={"/ads"}>
                        SoMe mainokset
                    </Link>
                </li>
            </ul>
		</>
	);
};

export default Navbar;
