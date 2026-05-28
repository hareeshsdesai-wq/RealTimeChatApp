const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const User = require("../models/User");

router.post("/register", async (req, res) => {

    try {

        const { username, password } = req.body;

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword
        });

        await newUser.save();

        res.json({
            message: "Registration successful"
        });

    } catch (error) {

        console.log(error);

        res.json({
            message: "Server error"
        });
    }

});

router.post("/login", async (req, res) => {

    try {

        const { username, password } = req.body;

        const user = await User.findOne({ username });

        if (!user) {
            return res.json({
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.json({
                message: "Incorrect password"
            });
        }

        res.json({
            message: "Login successful",
            username: user.username
        });

    } catch (error) {

        console.log(error);

        res.json({
            message: "Server error"
        });
    }

});

module.exports = router;