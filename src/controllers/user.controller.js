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

// end point
const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
// or wala mobile app k liye 

    if (!incomingRefreshToken){
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


const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body

    // if (!(newPassword ==== confPassword)) {
    //     throw new error
    // }

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Old password is incorrect")
    }

    user.password = newPassword 
    await user.save({validateBeforeSave: false})
    // yaha par user.save isliye karaya hai jisse user.model me jo password wala hook wo call hojaye 
    // Database hamesha dusre continent me hota hai

    return res.status(200)
    .json(new ApiResponse(200, {}, "Password change succesfully"))
    // yaha pr user ko message bhej rahe hai aapka password succesfully change hogya hai
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res.status(200)
    .json(200, req.user, "current user fetched successfully")
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullname, email} = req.body

    if (!fullname || !email) {
        throw new ApiError(400, "ALL fields are required")
    }

    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullname: fullname,
                email: email
            }
          
        },
        {new: true}
    ).select("-password")

    return res.status(200)
    .json(new ApiResponse(200, user, "Accout details updated succesfully"))
})

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }
    const avatar = await uploadCloudinary(avatarLocalPath)

    if(!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new: true}
    ).select(-password)
    return res.status(200)
    .json(
        new ApiResponse(200, user, "Avatar image updated successfully")
    )
})

const updateUsercoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath) {
        throw new ApiError(400, "coverImage file is missing")
    }

    const coverImage = await uploadCloudinary(coverImageLocalPath)

    if(!coverImage.url) {
        throw new ApiError(400, "Error while uploading on coverImage")

    }
    
    // ye upr jo code hai wo file ka path or file ko dudhne k liye hai aur jab file miljayegi
    // uske baad usko update bhi karana padega to uske update karane k liye necche wala code 
    // likha hai humne 

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select(-password)

    return res.status(200)
    .json(
        new ApiResponse(200, user, "cover image updated successfully")
    )
})
// req.params  is stored dymanic value from extracted url from express.js

const getUserChannelProfile = asyncHandler(async(req, res) => {
    const {username} = req.params

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "Subscriptions", // yaha par function me sare letter lowercase me hojate hai aur word prural hojate hai
                localField: "_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup: {
                from: "Subscriptions", 
                localField: "_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields: {
                subscriberCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "subscribers.subscriber"]},// ye jo (in) operator hai array or object dono k andar count krke de deta hai aur is function
                        //hum ye count kar rhe hai ki humne subscribed kiya hai h ki nhi 
                        then: true,
                        else: false
                    }
                }

            }
        },
        {
            // project ka mtlb hota hai ki projection dena ki samne wale user ko kuch selected chijen dena hai 
            $project: {
                fullname: 1,
                username: 1, 
                subscriberCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    if (!channel?.lenght) {
        throw new ApiError(404, "channel does not exists")
        
    }

    return res.status(200)
    .json(new ApiResponse(200, channel[0]), "User fetched successfully")
     
})

// Aggregation pipeline ka code jo hai wo direct pass hota h to usme mongoose ki object Id hame khud hi dekhni pdti hai 
const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            // match stage in a mongoDB aggregation pipeline is used to filter the documents that pass through the pipelines
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            // it allows you to retrieve the related data from a differnt collection and embed it within the document of the current collection 
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreginField: "_id",
                as: "watchHistory",
                pipelines: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },// yaha par hame array mil rha tha aur phir usme hame first value nikalni padti to iske liye hamne agla code likha hai
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res.status(200)
.json(
    new ApiResponse(
        200,
        user[0].getWatchHistory,"Watch history fetched successfully"
    )    
)

})



export { registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUsercoverImage,
    getUserChannelProfile,
    getWatchHistory 


}

// auth.middleware is liye user.controller m nhi likh skte ki kuki ham use reuse nhi kr skte jaise ki post like krwana hai comment krna hai etc