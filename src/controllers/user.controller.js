import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import cookieParser from "cookie-parser";


const generateAccessAndRefreshTokens =async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
        // yaha par refreshtoken ko database me save karaya hai hummne validate k mtlb h ki hame sirf refesh token hi save krana hai

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError(500, "something went wrong while generating the refresh access token")
    }
}

const registerUser = asyncHandler( async (req, res) => {
    const {fullname, email, username, password } = req.body

    
    if (
        [fullname, email, username, password].some((field) => field?.trim() === "")
        // trim remove whitespace from both ends
    ) {
        throw new ApiError(400, "ALL fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
 
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadCloudinary(avatarLocalPath)
    const coverImage = await uploadCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "avatar file is required")
    }

    // yaha pr hum ye user isiliye create kr rahe hai kuki hamko database me entry krwani hai 
    const user = await User.create({
        fullname,
        avatar:avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password, 
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")
    // yaha pr frontend me ye na show ho ki ky?? password isliye yaha pr  .select use kiya hai

    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registerd succesfully")
    )
})

    const loginUser = asyncHandler(async(req, res) => {
    // reqbody -> data 
    // username or email
    //find the user 
    //password check
    // access and refresh token
    // send cookie

    const {email, username, password} = req.body

    if(!username && !email) {
        throw new ApiError(400, "username or email is required")
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if (!user) {
        throw new ApiError(404, "User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials")
    } 

    const {accessToken, refreshToken} =  await generateAccessAndRefreshTokens(user._id)

    // -----------------------------
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    
    // yaha par option ka isliye use hua h kuki cookie ko modified frontend se n kiya ja sake ise sirf authorized person hi use kar skte hai 
    const options = {
        httpOnly: true,
        secure: true
    }
    return res.status(200).cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )

})

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
// or wala mobile app k liye 

    if (incomingRefreshToken){
        throw new ApiError(401, "unauthorized request")
    }
    // ki token to h hi n apn pe

    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
        if (!user){
            throw new ApiError(402, "unauthorized Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Invalid Refresh token")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res.status(200).cookie("accessToken",accessToken,options)
        .cookie("refreshToken",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},"Access toekn Refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

export { registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken 

}

// auth.middleware is liye user.controller m nhi likh skte ki kuki ham use reuse nhi kr skte jaise ki post like krwana hai comment krna hai etc