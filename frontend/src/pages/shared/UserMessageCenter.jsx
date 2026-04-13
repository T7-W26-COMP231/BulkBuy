

import Navbar from "../../components/Navbar";
import MessageTree from '../../components/message-center'
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useOpsContext } from "../../contexts/OpsContext.jsx";
import React, { useContext, useMemo, useCallback, useState, useEffect } from "react";

import { fetchMessages } from '../../components/message-center/messageService.js';


export default function UserMessageCenter() {

  // Auth + Ops contexts
  const { user, accessToken } = useAuth();
  const {
    orders,
    msgCenter, setMsgCenter,
    wsuproducts, setWsuproducts,
    wsuorders, setWsuorders,
    backendUrl
  } = useOpsContext();

  const [msges, setMsges] = useState([]);

  useEffect(()=>{

    const loadMsges = async () => {
      // Build a Mongo-style filter (ready to pass to backend controller)
      // Assumes `userId` is the current user's id (string or ObjectId-compatible)
      // and you want system messages not older than 14 days, not deleted.

      const userId = user?._id ?? user?.userId ?? null; // supply from your auth context
      const now = new Date();
      const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago

      // Base constraints
      const baseConstraints = {
        type: "system",                 // only system messages
        deleted: { $ne: true },         // exclude soft-deleted docs
        status: { $ne: "deleted" },     // ensure status isn't deleted if you use status field
        $or: [
          { createdAt: { $gte: cutoff } },
          { updatedAt: { $gte: cutoff } }
        ]
      };

      // Recipient / ownership clause
      // If userId is present, include messages where recipients.all === true
      // OR recipients.users contains the user OR metadata.formUserId equals userId.
      // If userId is not present, only include recipients.all === true.
      const recipientClause = userId
        ? {
            $or: [
              { "recipients.all": true },
              { "recipients.users": { $in: [userId] } },
              { "metadata.formUserId": userId },
              { "metadata.form_user_id": userId }
            ]
          }
        : { "recipients.all": true };

      // Optional region scoping (uncomment / set if needed)
      // const regionClause = { ops_region: "Toronto Central" };

      // Combine into final filter
      const filter = {
        $and: [
          baseConstraints,
          recipientClause,
          // regionClause, // include if you want to scope by ops_region
        ]
      };
      try {
        // Example: call the workhorse service (backend expects a Mongo-style filter)
        const messages = await fetchMessages({ filter , mock: false }, {});
        setMsges([...messages, ...msgCenter.notifs]);
        // messages may be an array or an object depending on your backend; handle accordingly
      } catch (error) {
        console.log('this is the msglist fetch error ----------------> ', error);// --------------------------------------
      }
    };
    loadMsges()

    // const loadMessages = async () => {
    //   const userId = user?._id ?? user?.userId ?? null;
    //   const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    //   // 1. Build the Mongo-style filter
    //   const mongoFilter = {
    //     type: "system",
    //     deleted: { $ne: true },
    //     status: { $ne: "deleted" },
    //     $and: [
    //       {
    //         $or: [
    //           { createdAt: { $gte: cutoff } },
    //           { updatedAt: { $gte: cutoff } }
    //         ]
    //       },
    //       {
    //         $or: [
    //           { "recipients.all": true },
    //           { "recipients.users": userId ? { $in: [userId] } : { $exists: true } },
    //           { "metadata.formUserId": userId },
    //           { "metadata.form_user_id": userId }
    //         ]
    //       }
    //     ]
    //   };

    //   try {
    //     // Example: call the workhorse service (backend expects a Mongo-style filter)
    //     const messages = await fetchMessages({ filter: mongoFilter, mock: false }, {});
    //     setMsges(messages);       
    //     // messages may be an array or an object depending on your backend; handle accordingly
    //   } catch (error) {
    //     console.log('---msglist fetch error ----------------> ', error);
    //   }

      
    // };
    // loadMessages();
    
  }, [msges?.length, msgCenter.notifs.length]);

    /* Default options */
  const DEFAULT_TYPE_OPTIONS = [
    { value: "notification", label: "Notification" },
    { value: "issue_wall", label: "Issue Wall" },
    { value: "email", label: "Email" },
    { value: "order", label: "Order" },
    { value: "review", label: "Review" },
    { value: "system", label: "system" },
  ];

  const DEFAULT_STATUS_OPTIONS = [
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Submitted" },
    { value: "read", label: "Read" },
    { value: "unread", label: "Unread" },
  ];


  const isAdministrator = useMemo(() => user?.role === 'administrator', [ user?.role ]);
  const settingsProp = {
    showType : isAdministrator,
    typeOptions : DEFAULT_TYPE_OPTIONS,
    showStatus : isAdministrator,
    statusOptions : DEFAULT_STATUS_OPTIONS,
    showOpsRegion : isAdministrator,
    showRecipients : isAdministrator,
  };

  const permissions = {
    canRead: true,
    canReply: true,
    canUpdate: true,
    canDelete: isAdministrator,
    canCreate: isAdministrator,
  };

  // factory that binds current user and returns actionFilter(message, action)
  function makeActionFilter(currentUser=null) {
    // currentUser: { _id, userId, role } where role is 'customer'|'administrator'|'supplier'
    const blockedTypes = new Set(["email", "notification", "system"]);

    return function actionFilter(message, action=null) {
      if (!message) return false;      

      // 1) messages of these types have no CRUD
      if (blockedTypes.has(String(message.type).toLowerCase())) return false;

      if (!action) return false;

      // normalize recipients shape: support { all: bool, users: [] } or array of ids
      const recipientsAll = Boolean(message?.recipients?.all);
      const recipientList =
        Array.isArray(message?.recipients) ? message.recipients : Array.isArray(message?.recipients?.users) ? message.recipients.users : [];

      // helper: is current user a recipient
      const isPublic = message.type.toLowerCase() === 'issue_wall' || recipientsAll; 
      const isAuthor = currentUser && (String(currentUser.userId) || String(currentUser._id)) === String(message.userId);
      const isSupplier = currentUser && currentUser.role === "supplier";
      const isRecipient = currentUser && Array.isArray(recipientList) && recipientList.length > 0 && recipientList.includes(currentUser?.userId);
      const isAdministrator = currentUser && currentUser.role === "administrator";

      // ACTION: reply
      if (action === "reply") {
        // only recipients may reply
        const canReplyToMsge = isPublic || isRecipient || isAuthor || isAdministrator ;
        return Boolean(canReplyToMsge);
      }

      if (currentUser) {
        // ACTION: update
        if (action === "update") {
          // allowed only for administrators or the message author
          if (isAdministrator || isAuthor) return true;
          return false;
        }

        // ACTION: delete
        if (action === "delete") {
          // only administrators or the author can delete
          if (isAdministrator || isAuthor) return true;
          return false;
        }

        // ACTION: create (global create permission still applies; here allow admins and suppliers as example)
        if (action === "create") {
          return isAdministrator /* || isSupplier */;
        }
      }
      // default deny
      return false;
    };
  }

  // create filter and pass to MessageTree
  const actionFilter = useMemo(() => makeActionFilter(user), [user]);

  return (
    <>
      <Navbar/>
      <MessageTree isAdminPermitted={isAdministrator} 
        actionFilter={actionFilter}
        messages= { msges.length > 0 ? msges : [] }
        showAdminTab={isAdministrator}
        settingsProp={settingsProp}
        permissions={permissions}>

      </MessageTree>
    </>
  );
}